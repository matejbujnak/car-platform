"""Public endpoints with scraped listings."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, func, select

from app.db.session import get_session
from app.db.models import Listing

router = APIRouter(prefix="/api/listings", tags=["listings"])


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
    return {
        "total": total,
        "items": [
            {
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
            for row in rows
        ],
    }


@router.get("/{listing_id}")
def get_listing(listing_id: int, session: Session = Depends(get_session)) -> dict:
    row = session.get(Listing, listing_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    return {
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
