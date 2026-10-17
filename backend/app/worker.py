"""Background worker: processes jobs from the Redis queue.

Run with: python -m app.worker
"""

import logging
import time

from sqlmodel import Session

from app import config, scraper, store, tasks
from app.db import engine
from app.models import ScrapeRun, utcnow

log = logging.getLogger("worker")


def run_scrape_job(job: dict) -> None:
    if not scraper.within_scrape_window():
        log.info(
            "Skipping scrape job: outside the scrape window (UTC %s-%s)",
            config.SCRAPE_WINDOW_START_HOUR,
            config.SCRAPE_WINDOW_END_HOUR,
        )
        return

    pages = min(int(job.get("pages") or 2), config.SCRAPE_MAX_PAGES_PER_RUN)
    log.info("Scrape job started (max %s pages)", pages)

    with Session(engine) as session:
        run = ScrapeRun(status=ScrapeRun.Status.running)
        session.add(run)
        session.commit()
        session.refresh(run)

        new = updated = 0
        try:
            for batch in scraper.iter_pages(pages):
                n, u = store.upsert_listings(session, batch)
                new += n
                updated += u
                log.info("Saved page batch: %s new, %s updated", n, u)
            run.status = ScrapeRun.Status.success
        except scraper.HourlyLimitReached as exc:
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

    log.info("Scrape job finished: %s new, %s updated", new, updated)


def dispatch(job: dict) -> None:
    if job.get("type") == "scrape":
        run_scrape_job(job)
    else:
        log.warning("Unknown job type: %s", job.get("type"))


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    log.info("Worker started, waiting for jobs...")
    while True:
        try:
            job = tasks.dequeue(timeout=5)
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
