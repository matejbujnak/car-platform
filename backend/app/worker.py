"""Background worker: processes jobs from the Redis queue and runs the
scheduled daily full-site crawl.

Run with: python -m app.worker
"""

import logging
import time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from requests.exceptions import RequestException
from sqlalchemy import text
from sqlmodel import Session, select

from app import config
from app.db.models import Listing, ModelVersion, Prediction, ScrapeRun, utcnow
from app.db.session import engine
from app.ml.features import plausible_price
from app.ml.predict import CAR_FIELDS, active_model, deal_verdict, load_artifact, predict_prices
from app.scraping import autobazar, jobs, store

log = logging.getLogger("worker")

POLL_SECONDS = 10
PREDICTION_BATCH = 500
PREDICTION_SWEEP_SECONDS = 15 * 60
# When this many segments fail in a row, the source site is probably
# throttling us - continuing would crawl nothing for hours.
MAX_CONSECUTIVE_FAILURES = 5
# Minimum gap before retrying an incomplete crawl.
RETRY_GAP = timedelta(hours=2)

# Quick runs look at the same slice of the catalogue as the full crawl, so the
# "sold" detection (which trusts the crawl coverage) stays correct.
QUICK_FILTERS = {
    "year_from": autobazar.BASE_YEAR_FROM,
    "mileage_to": autobazar.BASE_MILEAGE_TO,
    "damaged": True,  # site quirk: true == NON-damaged
}


# --- scheduling -------------------------------------------------------------

def _crawl_complete(run: ScrapeRun) -> bool:
    return (
        run.status == ScrapeRun.Status.success
        and run.segments_total > 0
        and run.segments_failed == 0
        and run.segments_done >= run.segments_total
    )


def _full_scrape_pending(session: Session, now: datetime) -> bool:
    """True when today's full crawl should be started (or a failed one retried).

    At most one complete crawl runs per day - a manually triggered one counts
    as well. Incomplete crawls (throttling, crashes) may be retried, but not
    more often than every RETRY_GAP.
    """
    if now.hour < config.SCRAPE_SCHEDULE_HOUR:
        return False

    latest = session.exec(
        select(ScrapeRun)
        .where(ScrapeRun.kind == ScrapeRun.Kind.full)
        .order_by(ScrapeRun.id.desc())
        .limit(1)
    ).first()
    if latest is None:
        return True
    if latest.status == ScrapeRun.Status.running:
        return False  # a crawl is already in progress (e.g. resumed)

    now_utc = now.astimezone(timezone.utc).replace(tzinfo=None)
    today_start = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
    if latest.started_at >= today_start and _crawl_complete(latest):
        return False
    return (now_utc - latest.started_at) >= RETRY_GAP


# --- jobs -------------------------------------------------------------------

def run_quick_scrape(job: dict) -> None:
    """Small manual run: fetch the first N listing pages."""
    if not autobazar.within_scrape_window():
        log.info("Skipping scrape job: outside the scrape window")
        return

    pages = min(int(job.get("pages") or 2), config.SCRAPE_QUICK_MAX_PAGES)
    log.info("Quick scrape started (max %s pages)", pages)

    with Session(engine) as session:
        run = ScrapeRun(kind=ScrapeRun.Kind.quick, status=ScrapeRun.Status.running)
        session.add(run)
        session.commit()
        session.refresh(run)

        new = updated = 0
        try:
            for batch in autobazar.iter_pages(pages, QUICK_FILTERS):
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


def _mark_missing_as_sold(session: Session, crawl_start: datetime) -> int:
    """Mark active listings the complete crawl did not see as sold.

    Only trust this after a CLEAN, complete crawl: a listing missing from a
    full pass over the catalogue no longer exists on the source site.
    """
    result = session.execute(
        text(
            "UPDATE listing SET status = 'sold' "
            "WHERE status = 'active' AND last_seen < :start"
        ),
        {"start": crawl_start},
    )
    session.commit()
    return int(result.rowcount or 0)


def run_full_scrape(job: dict) -> None:
    """Crawl the whole catalogue segment by segment (slow, runs for hours).

    The run saves its cursor after every segment, so an interrupted crawl
    resumes where it stopped. Only a clean, complete crawl marks missing
    listings as sold.
    """
    if not autobazar.within_scrape_window():
        log.info("Skipping full scrape: outside the scrape window")
        return

    max_segments = job.get("max_segments")
    segments = autobazar.build_segments()
    log.info(
        "Full crawl: %s segments%s",
        len(segments),
        f" (limited to {max_segments})" if max_segments else "",
    )

    with Session(engine) as session:
        run = _resume_or_create_full_run(session)
        start = run.cursor or 0
        run.segments_total = len(segments)
        session.add(run)
        session.commit()

        # The same car can appear in several segments (promoted padding
        # listings); process each car only once per run.
        seen: set[str] = set()
        consecutive_failures = 0
        aborted = False

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
                    for batch in autobazar.iter_pages(
                        autobazar.MAX_PAGE, filters, split=True
                    ):
                        batch = [i for i in batch if i["source_id"] not in seen]
                        seen.update(i["source_id"] for i in batch)
                        if not batch:
                            continue
                        n, u = store.upsert_listings(session, batch)
                        run.listings_new += n
                        run.listings_updated += u
                        session.add(run)
                        session.commit()
                    run.segments_done += 1
                    consecutive_failures = 0
                    break
                except autobazar.HourlyLimitReached as exc:
                    log.warning("%s - pausing until the next hour", exc)
                    _sleep_until_next_hour()
                except (RequestException, autobazar.ScrapeError) as exc:
                    run.segments_failed += 1
                    consecutive_failures += 1
                    log.warning(
                        "Segment '%s' failed (%s: %s)",
                        run.current_segment,
                        type(exc).__name__,
                        exc,
                    )
                    if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                        run.error = (
                            f"{consecutive_failures} segments in a row failed "
                            f"({type(exc).__name__}) - the source site is probably "
                            "throttling us; aborting"
                        )
                        aborted = True
                    break

            session.add(run)
            session.commit()
            if aborted:
                break

        complete = run.segments_failed == 0 and run.segments_done >= len(segments)
        if max_segments is not None:
            # Deliberate partial run (testing / refresh) - no sold marking.
            run.status = ScrapeRun.Status.success
        elif complete:
            sold = _mark_missing_as_sold(session, run.started_at)
            log.info("Crawl complete - marked %s listings as sold", sold)
            run.status = ScrapeRun.Status.success
            run.cursor = None
            run.current_segment = None
        else:
            run.status = ScrapeRun.Status.failed
            if not run.error:
                run.error = (
                    f"crawl incomplete: {run.segments_done} segments done, "
                    f"{run.segments_failed} failed of {len(segments)}"
                )

        run.finished_at = utcnow()
        session.add(run)
        session.commit()
        log.info(
            "Full crawl finished (%s): %s new, %s updated, segments %s/%s done, %s failed",
            run.status.value,
            run.listings_new,
            run.listings_updated,
            run.segments_done,
            run.segments_total,
            run.segments_failed,
        )


def run_prediction_backfill() -> None:
    """Compute cached predictions for listings that do not have them yet.

    Runs automatically after every scrape run and every training run, plus as a
    periodic sweep, so the prediction cache is always up to date.
    """
    with Session(engine) as session:
        mv = active_model(session)
        if mv is None:
            log.info("No trained model - skipping prediction backfill")
            return
        artifact = load_artifact(mv.artifact_path)

        created = 0
        while True:
            rows = session.exec(
                select(Listing)
                .where(
                    Listing.id.not_in(
                        select(Prediction.listing_id).where(
                            Prediction.model_version_id == mv.id
                        )
                    )
                )
                .order_by(Listing.id)
                .limit(PREDICTION_BATCH)
            ).all()
            if not rows:
                break

            predictions = predict_prices(
                artifact, [{k: getattr(r, k) for k in CAR_FIELDS} for r in rows]
            )
            for row, pred in zip(rows, predictions):
                verdict = score = None
                # Rentals/subscription offers and placeholder prices get no
                # deal verdict - their price is not a sale price.
                if row.offer_type == "sale" and plausible_price(row.price_eur):
                    verdict, score = deal_verdict(row.price_eur, pred)
                session.add(
                    Prediction(
                        listing_id=row.id,
                        model_version_id=mv.id,
                        fair_price_eur=pred["fair_price_eur"],
                        interval_low_eur=pred["interval_low_eur"],
                        interval_high_eur=pred["interval_high_eur"],
                        deal_verdict=verdict,
                        deal_score=score,
                    )
                )
            session.commit()
            created += len(rows)

    log.info("Prediction backfill finished: %s rows for model '%s'", created, mv.name)


def run_training_job() -> None:
    """Train a new model version and register it (see app/ml/train.py)."""
    from app.ml import train as ml_train

    log.info("Model training started")
    try:
        ml_train.train()
        log.info("Model training finished")
    except Exception as exc:  # noqa: BLE001 - a failed run must not kill the worker
        log.exception("Model training failed")
        raise RuntimeError(f"training failed: {exc}") from exc


def dispatch(job: dict) -> None:
    kind = job.get("type")
    if kind == "scrape":
        run_quick_scrape(job)
        jobs.enqueue({"type": "backfill_predictions"})
    elif kind == "scrape_full":
        run_full_scrape(job)
        jobs.enqueue({"type": "backfill_predictions"})
    elif kind == "train_model":
        run_training_job()
        jobs.enqueue({"type": "backfill_predictions"})
    elif kind == "backfill_predictions":
        run_prediction_backfill()
    else:
        log.warning("Unknown job type: %s", kind)


# --- main loop --------------------------------------------------------------

def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    log.info("Worker started, waiting for jobs...")

    # A crawl interrupted by a restart should continue from its checkpoint
    # instead of waiting for the next scheduled run.
    with Session(engine) as session:
        interrupted = session.exec(
            select(ScrapeRun)
            .where(
                ScrapeRun.kind == ScrapeRun.Kind.full,
                ScrapeRun.status == ScrapeRun.Status.running,
            )
            .limit(1)
        ).first()
        if interrupted is not None:
            log.info("Found interrupted full crawl (run %s) - resuming", interrupted.id)
            jobs.enqueue({"type": "scrape_full", "resume": True})

    last_sweep = 0.0
    while True:
        try:
            with Session(engine) as session:
                if _full_scrape_pending(session, datetime.now(ZoneInfo(config.SCHEDULE_TZ))):
                    log.info("Queueing the scheduled full crawl")
                    jobs.enqueue({"type": "scrape_full", "scheduled": True})

            # Periodic sweep: make sure no listing is left without a prediction
            # (covers crashes between scrape/training and backfill). Skipped when
            # the queue is busy, so jobs do not pile up during a long crawl.
            if (
                time.monotonic() - last_sweep > PREDICTION_SWEEP_SECONDS
                and jobs.client().llen(jobs.QUEUE) == 0
            ):
                last_sweep = time.monotonic()
                jobs.enqueue({"type": "backfill_predictions"})

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
