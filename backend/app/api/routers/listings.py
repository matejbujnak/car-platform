"""Public endpoints with scraped listings."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, func, select

from app.db.models import Listing
from app.db.session import get_session
from app.ml.predict import CAR_FIELDS, active_artifact, deal_verdict, predict_prices

router = APIRouter(prefix="/api/listings", tags=["listings"])


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
        if row.price_eur:
            verdict, score = deal_verdict(row.price_eur, prediction)
            item["deal_verdict"] = verdict
            item["deal_score"] = score
    return item


def _enriched(rows: list[Listing], session: Session) -> list[dict]:
    """Attach fair-price predictions to listings when a model is trained."""
    artifact = active_artifact(session)
    predictions = (
        predict_prices(artifact, [{k: getattr(r, k) for k in CAR_FIELDS} for r in rows])
        if artifact is not None
        else [None] * len(rows)
    )
    return [_listing_dict(row, pred) for row, pred in zip(rows, predictions)]


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
