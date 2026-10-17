"""Admin endpoints: job triggers and monitoring."""

from fastapi import APIRouter, Depends, Query, Request
from sqlmodel import Session, select

from app import config
from app.scraping import jobs
from app.core.auth import get_current_user, require_roles
from app.db.models import ModelVersion, Role, ScrapeRun, User
from app.db.session import get_session
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
    """Queue a small scrape run; the worker processes it in the background."""
    pages = max(1, min(pages, config.SCRAPE_QUICK_MAX_PAGES))
    jobs.enqueue({"type": "scrape", "pages": pages, "requested_by": user.id})
    return {"queued": True, "pages": pages}


@router.post("/scrape/full")
@limiter.limit("5/minute")
def trigger_full_scrape(
    request: Request,
    max_segments: int | None = Query(None, ge=1, le=10_000),
    user: User = Depends(get_current_user),
) -> dict:
    """Queue the full-site crawl (slow, runs for hours). Normally scheduled
    daily; `max_segments` limits the crawl for testing or partial refreshes."""
    job: dict = {"type": "scrape_full", "requested_by": user.id}
    if max_segments is not None:
        job["max_segments"] = max_segments
    jobs.enqueue(job)
    return {"queued": True, "job": "scrape_full", "max_segments": max_segments}


@router.get("/scrape/runs")
def scrape_runs(session: Session = Depends(get_session)) -> list[dict]:
    """Recent scrape runs (newest first)."""
    runs = session.exec(select(ScrapeRun).order_by(ScrapeRun.id.desc()).limit(20)).all()
    return [
        {
            "id": run.id,
            "kind": run.kind.value,
            "started_at": run.started_at,
            "finished_at": run.finished_at,
            "status": run.status.value,
            "current_segment": run.current_segment,
            "cursor": run.cursor,
            "listings_new": run.listings_new,
            "listings_updated": run.listings_updated,
            "error": run.error,
        }
        for run in runs
    ]


@router.get("/models")
def models(session: Session = Depends(get_session)) -> list[dict]:
    """Registered model versions with their metrics (newest first)."""
    rows = session.exec(select(ModelVersion).order_by(ModelVersion.id.desc()).limit(20)).all()
    return [
        {
            "id": row.id,
            "name": row.name,
            "dataset_rows": row.dataset_rows,
            "metrics": row.metrics,
            "is_active": row.is_active,
            "trained_at": row.trained_at,
        }
        for row in rows
    ]


@router.post("/models/retrain")
@limiter.limit("5/minute")
def retrain_model(
    request: Request,
    user: User = Depends(get_current_user),
) -> dict:
    """Queue a model training run; the worker processes it in the background."""
    jobs.enqueue({"type": "train_model", "requested_by": user.id})
    return {"queued": True, "job": "train_model"}
