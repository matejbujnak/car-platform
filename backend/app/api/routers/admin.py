"""Admin endpoints: job triggers and monitoring."""

from fastapi import APIRouter, Depends, Request
from sqlmodel import Session, select

from app import config
from app.scraping import jobs
from app.core.auth import get_current_user, require_roles
from app.db.session import get_session
from app.db.models import Role, ScrapeRun, User
from app.core.rate_limit import limiter

router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
    dependencies=[Depends(require_roles(Role.admin))],
)


@router.post("/scrape")
@limiter.limit("10/minute")
def trigger_scrape(
    request: Request,
    pages: int = 2,
    user: User = Depends(get_current_user),
) -> dict:
    """Queue a scrape job; the worker processes it in the background."""
    pages = max(1, min(pages, config.SCRAPE_MAX_PAGES_PER_RUN))
    jobs.enqueue({"type": "scrape", "pages": pages, "requested_by": user.id})
    return {"queued": True, "pages": pages}


@router.get("/scrape/runs")
def scrape_runs(session: Session = Depends(get_session)) -> list[dict]:
    """Recent scrape runs (newest first)."""
    runs = session.exec(select(ScrapeRun).order_by(ScrapeRun.id.desc()).limit(20)).all()
    return [
        {
            "id": run.id,
            "started_at": run.started_at,
            "finished_at": run.finished_at,
            "status": run.status.value,
            "listings_new": run.listings_new,
            "listings_updated": run.listings_updated,
            "error": run.error,
        }
        for run in runs
    ]
