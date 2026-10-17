"""Background worker: processes jobs from the Redis queue and runs the
scheduled daily full-site crawl.

Run with: python -m app.worker
"""

import logging
import time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from requests.exceptions import RequestException
from sqlmodel import Session, select

from app import config
from app.db.models import ScrapeRun, utcnow
from app.db.session import engine
from app.scraping import autobazar, jobs, store

log = logging.getLogger("worker")

POLL_SECONDS = 10


# --- scheduling -------------------------------------------------------------

def _full_scrape_pending(session: Session, now: datetime) -> bool:
    """True when today's scheduled full crawl should be started now."""
    if now.hour < config.SCRAPE_SCHEDULE_HOUR:
        return False

    active = session.exec(
        select(ScrapeRun)
        .where(
            ScrapeRun.kind == ScrapeRun.Kind.full,
            ScrapeRun.status == ScrapeRun.Status.running,
        )
        .limit(1)
    ).first()
    if active is not None:
        return False  # a crawl is already in progress (e.g. resumed)

    today_start_utc = (
        now.replace(hour=0, minute=0, second=0, microsecond=0)
        .astimezone(timezone.utc)
        .replace(tzinfo=None)
    )
    started_today = session.exec(
        select(ScrapeRun)
        .where(
            ScrapeRun.kind == ScrapeRun.Kind.full,
            ScrapeRun.started_at >= today_start_utc,
        )
        .limit(1)
    ).first()
    return started_today is None


# --- jobs -------------------------------------------------------------------

def run_quick_scrape(job: dict) -> None:
    """Small manual run: fetch the first N listing pages."""
    if not autobazar.within_scrape_window():
        log.info("Skipping scrape job: outside the scrape window")
        return

    pages = min(int(job.get("pages") or 2), config.SCRAPE_MAX_PAGES_PER_RUN)
    log.info("Quick scrape started (max %s pages)", pages)

    with Session(engine) as session:
        run = ScrapeRun(kind=ScrapeRun.Kind.quick, status=ScrapeRun.Status.running)
        session.add(run)
        session.commit()
        session.refresh(run)

        new = updated = 0
        try:
            for batch in autobazar.iter_pages(pages):
                n, u = store.upsert_listings(session, batch)
                new += n
                updated += u
                log.info("Saved page batch: %s new, %s updated", n, u)
            run.status = ScrapeRun.Status.success
        except autobazar.HourlyLimitReached as exc:
            # Partial results are fine; just stop politely and try later.
            log.warning("Stopping scrape run: %s", exc)
            run.status = ScrapeRun.Status.success
            run.error = str(exc)
        except Exception as exc:  # noqa: BLE001 - a failed run must not kill the worker
            log.exception("Scrape job failed")
            run.status = ScrapeRun.Status.failed
            run.error = str(exc)[:500]

        run.listings_new = new
        run.listings_updated = updated
        run.finished_at = utcnow()
        session.add(run)
        session.commit()

    log.info("Quick scrape finished: %s new, %s updated", new, updated)


def _sleep_until_next_hour() -> None:
    """Wait for the next rate-limit window (the counter resets every hour)."""
    now = datetime.now(timezone.utc)
    next_hour = now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    seconds = max(1.0, (next_hour - now).total_seconds() + 5)
    log.info("Sleeping %.0f s until the next rate-limit window", seconds)
    time.sleep(seconds)


def _resume_or_create_full_run(session: Session) -> ScrapeRun:
    """Continue an interrupted full crawl, or start a new one."""
    existing = session.exec(
        select(ScrapeRun)
        .where(
            ScrapeRun.kind == ScrapeRun.Kind.full,
            ScrapeRun.status == ScrapeRun.Status.running,
        )
        .order_by(ScrapeRun.id.desc())
        .limit(1)
    ).first()
    if existing is not None:
        log.info("Resuming full crawl at segment %s", existing.cursor)
        return existing

    run = ScrapeRun(kind=ScrapeRun.Kind.full, status=ScrapeRun.Status.running)
    session.add(run)
    session.commit()
    session.refresh(run)
    return run


def run_full_scrape(job: dict) -> None:
    """Crawl the whole catalogue segment by segment (slow, runs for hours).

    The run saves its cursor after every segment, so an interrupted crawl
    resumes where it stopped instead of starting over.
    """
    if not autobazar.within_scrape_window():
        log.info("Skipping full scrape: outside the scrape window")
        return

    max_segments = job.get("max_segments")
    segments = autobazar.build_segments()
    log.info("Full crawl: %s segments%s", len(segments),
             f" (limited to {max_segments})" if max_segments else "")

    with Session(engine) as session:
        run = _resume_or_create_full_run(session)
        start = run.cursor or 0

        # The same car can appear in several segments (promoted padding
        # listings); process each car only once per run.
        seen: set[str] = set()
        try:
            for idx in range(start, len(segments)):
                if max_segments is not None and idx - start >= max_segments:
                    break

                make, year = segments[idx]
                run.current_segment = f"{make or 'all'} {year}"
                run.cursor = idx
                session.add(run)
                session.commit()

                filters = autobazar.segment_filters(make, year)
                while True:  # retries the segment after a rate-limit pause
                    try:
                        for batch in autobazar.iter_pages(autobazar.MAX_PAGE, filters):
                            batch = [i for i in batch if i["source_id"] not in seen]
                            seen.update(i["source_id"] for i in batch)
                            if not batch:
                                continue
                            n, u = store.upsert_listings(session, batch)
                            run.listings_new += n
                            run.listings_updated += u
                            session.add(run)
                            session.commit()
                        break
                    except autobazar.HourlyLimitReached as exc:
                        log.warning("%s - pausing until the next hour", exc)
                        _sleep_until_next_hour()
                    except RequestException as exc:
                        # A flaky segment must not kill the whole crawl.
                        log.warning("Segment '%s' failed (%s) - skipping",
                                    run.current_segment, exc)
                        break

            run.status = ScrapeRun.Status.success
            run.cursor = None
            run.current_segment = None
        except Exception as exc:  # noqa: BLE001 - a failed run must not kill the worker
            log.exception("Full crawl failed")
            run.status = ScrapeRun.Status.failed
            run.error = str(exc)[:500]

        run.finished_at = utcnow()
        session.add(run)
        session.commit()
        log.info("Full crawl finished: %s new, %s updated",
                 run.listings_new, run.listings_updated)


def dispatch(job: dict) -> None:
    kind = job.get("type")
    if kind == "scrape":
        run_quick_scrape(job)
    elif kind == "scrape_full":
        run_full_scrape(job)
    else:
        log.warning("Unknown job type: %s", kind)


# --- main loop --------------------------------------------------------------

def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    log.info("Worker started, waiting for jobs...")
    while True:
        try:
            with Session(engine) as session:
                if _full_scrape_pending(session, datetime.now(ZoneInfo(config.SCHEDULE_TZ))):
                    log.info("Queueing the scheduled full crawl")
                    jobs.enqueue({"type": "scrape_full", "scheduled": True})

            job = jobs.dequeue(timeout=POLL_SECONDS)
            if job is None:
                continue
            log.info("Job received: %s", job)
            dispatch(job)
        except KeyboardInterrupt:
            log.info("Worker stopped")
            return
        except Exception:  # noqa: BLE001 - keep the worker alive on infra errors
            log.exception("Job dispatch failed")
            time.sleep(5)


if __name__ == "__main__":
    main()
