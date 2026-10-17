"""Public endpoints with scraped listings."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, func, select

from app.db.models import Listing, Prediction
from app.db.session import get_session
from app.ml.predict import (
    CAR_FIELDS,
    active_model,
    deal_verdict,
    load_artifact,
    predict_prices,
)

router = APIRouter(prefix="/api/listings", tags=["listings"])


def _cached_prediction(row: Prediction) -> dict:
    return {
        "fair_price_eur": round(row.fair_price_eur),
        "interval_low_eur": round(row.interval_low_eur),
        "interval_high_eur": round(row.interval_high_eur),
        "deal_verdict": row.deal_verdict,
        "deal_score": row.deal_score,
    }


def _listing_dict(row: Listing, prediction: dict | None) -> dict:
    item = {
        "id": row.id,
        "source_id": row.source_id,
        "url": row.url,
        "title": row.title,
        "make": row.make,
        "model": row.model,
        "year": row.year,
        "mileage_km": row.mileage_km,
        "fuel": row.fuel,
        "power_kw": row.power_kw,
        "engine_cc": row.engine_cc,
        "gearbox": row.gearbox,
        "body": row.body,
        "drive": row.drive,
        "seller_type": row.seller_type,
        "price_eur": row.price_eur,
        "last_seen": row.last_seen,
    }
    if prediction is not None:
        item.update(prediction)
    return item


def _enriched(rows: list[Listing], session: Session) -> list[dict]:
    """Attach fair-price predictions from the cache (computed by the worker).

    Very fresh listings may not be cached yet - for those the prediction is
    computed on the fly and will be cached by the next backfill run.
    """
    mv = active_model(session)
    if mv is None:
        return [_listing_dict(row, None) for row in rows]

    cached = {
        p.listing_id: _cached_prediction(p)
        for p in session.exec(
            select(Prediction).where(
                Prediction.model_version_id == mv.id,
                Prediction.listing_id.in_([row.id for row in rows]),
            )
        ).all()
    }

    missing = [row for row in rows if row.id not in cached]
    if missing:
        artifact = load_artifact(mv.artifact_path)
        predictions = predict_prices(
            artifact, [{k: getattr(r, k) for k in CAR_FIELDS} for r in missing]
        )
        for row, pred in zip(missing, predictions):
            verdict = score = None
            if row.price_eur:
                verdict, score = deal_verdict(row.price_eur, pred)
            cached[row.id] = {
                **pred,
                "deal_verdict": verdict,
                "deal_score": score,
            }

    return [_listing_dict(row, cached.get(row.id)) for row in rows]


@router.get("")
def list_listings(
    session: Session = Depends(get_session),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    make: str | None = Query(None),
) -> dict:
    """Paginated listing feed (newest data first)."""
    query = select(Listing)
    count_query = select(func.count()).select_from(Listing)
    if make:
        query = query.where(Listing.make == make)
        count_query = count_query.where(Listing.make == make)

    total = session.exec(count_query).one()
    rows = session.exec(
        query.order_by(Listing.id.desc()).offset(offset).limit(limit)
    ).all()
    return {"total": total, "items": _enriched(rows, session)}


@router.get("/{listing_id}")
def get_listing(listing_id: int, session: Session = Depends(get_session)) -> dict:
    row = session.get(Listing, listing_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    return _enriched([row], session)[0]
