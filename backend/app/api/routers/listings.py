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
from app.ml.features import plausible_price

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
        "status": row.status,
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
            if plausible_price(row.price_eur):
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
    make: str | None = Query(None, description="comma-separated list of makes"),
    fuel: str | None = Query(None),
    gearbox: str | None = Query(None),
    body: str | None = Query(None),
    drive: str | None = Query(None),
    price_min: float | None = Query(None, ge=0),
    price_max: float | None = Query(None, ge=0),
    year_min: int | None = Query(None, ge=1900),
    year_max: int | None = Query(None, le=2100),
    mileage_max: int | None = Query(None, ge=0),
    status: str = Query("active", pattern="^(active|sold|all)$"),
    verdict: str | None = Query(None, pattern="^(cheap|fair|overpriced|suspicious)$"),
    sort: str = Query(
        "newest",
        pattern="^(newest|price_low|price_high|year_new|year_old|mileage_low|mileage_high|fair_low|fair_high|deal_best|deal_worst)$",
    ),
) -> dict:
    """Paginated listing feed with filtering and sorting."""
    conditions = []
    if make:
        makes = [m for m in make.split(",") if m]
        if makes:
            conditions.append(Listing.make.in_(makes))
    if fuel:
        conditions.append(Listing.fuel == fuel)
    if gearbox:
        # Gearbox values in the data are free-form ("6-st. manualna",
        # "Automaticka", ...) - match the meaning instead of the exact string.
        g = gearbox.lower()
        if "auto" in g:
            conditions.append(Listing.gearbox.ilike("%auto%"))
        elif "manu" in g:
            conditions.append(Listing.gearbox.ilike("%manu%"))
        else:
            conditions.append(Listing.gearbox == gearbox)
    if body:
        conditions.append(Listing.body == body)
    if drive:
        conditions.append(Listing.drive == drive)
    if price_min is not None:
        conditions.append(Listing.price_eur >= price_min)
    if price_max is not None:
        conditions.append(Listing.price_eur <= price_max)
    if year_min is not None:
        conditions.append(Listing.year >= year_min)
    if year_max is not None:
        conditions.append(Listing.year <= year_max)
    if mileage_max is not None:
        conditions.append(Listing.mileage_km <= mileage_max)
    if status != "all":
        conditions.append(Listing.status == status)

    mv = active_model(session)
    needs_prediction = verdict is not None or sort.startswith(("deal_", "fair_"))
    if needs_prediction and mv is None:
        return {"total": 0, "items": []}

    query = select(Listing)
    count_query = select(func.count()).select_from(Listing)
    if needs_prediction:
        pred_join = (Prediction.listing_id == Listing.id) & (
            Prediction.model_version_id == mv.id
        )
        query = query.join(Prediction, pred_join)
        count_query = count_query.join(Prediction, pred_join)
        if verdict is not None:
            conditions.append(Prediction.deal_verdict == verdict)

    for condition in conditions:
        query = query.where(condition)
        count_query = count_query.where(condition)

    if sort.startswith("deal_"):
        order = (
            Prediction.deal_score.desc().nulls_last()
            if sort == "deal_best"
            else Prediction.deal_score.asc().nulls_last()
        )
    elif sort.startswith("fair_"):
        order = (
            Prediction.fair_price_eur.asc().nulls_last()
            if sort == "fair_low"
            else Prediction.fair_price_eur.desc().nulls_last()
        )
    else:
        order = {
            "newest": Listing.id.desc(),
            "price_low": Listing.price_eur.asc().nulls_last(),
            "price_high": Listing.price_eur.desc().nulls_last(),
            "year_new": Listing.year.desc(),
            "year_old": Listing.year.asc(),
            "mileage_low": Listing.mileage_km.asc().nulls_last(),
            "mileage_high": Listing.mileage_km.desc().nulls_last(),
        }[sort]

    total = session.exec(count_query).one()
    rows = session.exec(query.order_by(order).offset(offset).limit(limit)).all()
    return {"total": total, "items": _enriched(rows, session)}


@router.get("/{listing_id}")
def get_listing(listing_id: int, session: Session = Depends(get_session)) -> dict:
    row = session.get(Listing, listing_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    return _enriched([row], session)[0]
