"""Public endpoints with scraped listings."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import asc, desc, nullslast, or_
from sqlmodel import Session, func, select

from app.db.models import Listing, Prediction
from app.db.session import get_session
from app.ml.predict import (
    CAR_FIELDS,
    active_artifact,
    active_model,
    deal_verdict,
    load_artifact,
    predict_prices,
)
from app.ml.features import plausible_price
from app.ml.explain import explain_instance

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
    model: str | None = Query(None, description="comma-separated list of models"),
    search: str | None = Query(None, description="text search in title, make and model"),
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
        pattern="^(newest|price_low|price_high|year_new|year_old|mileage_low|mileage_high|fair_low|fair_high|deal_best|deal_worst|profit_best|profit_worst)$",
    ),
) -> dict:
    """Paginated listing feed with filtering and sorting."""
    conditions = []
    if make:
        makes = [m for m in make.split(",") if m]
        if makes:
            conditions.append(Listing.make.in_(makes))
    if model:
        models = [m for m in model.split(",") if m]
        if models:
            conditions.append(Listing.model.in_(models))
    if search:
        pattern = f"%{search.strip()}%"
        conditions.append(
            or_(
                Listing.title.ilike(pattern),
                Listing.make.ilike(pattern),
                Listing.model.ilike(pattern),
            )
        )
    if fuel:
        fuels = [f for f in fuel.split(",") if f]
        if fuels:
            conditions.append(Listing.fuel.in_(fuels))
    if gearbox:
        # Gearbox values in the data are free-form ("6-st. manualna",
        # "Automaticka", ...) - match the meaning instead of the exact string.
        gearbox_patterns = []
        for value in gearbox.split(","):
            v = value.strip().lower()
            if "auto" in v:
                gearbox_patterns.append(Listing.gearbox.ilike("%auto%"))
            elif "manu" in v:
                gearbox_patterns.append(Listing.gearbox.ilike("%manu%"))
            elif value.strip():
                gearbox_patterns.append(Listing.gearbox == value.strip())
        if gearbox_patterns:
            conditions.append(or_(*gearbox_patterns))
    if body:
        bodies = [b for b in body.split(",") if b]
        if bodies:
            conditions.append(Listing.body.in_(bodies))
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
    if mv is None:
        # No model yet: fall back to plain browsing (sorting by prediction
        # needs the cache).
        verdict = None
        sort = "newest"

    needs_prediction = verdict is not None or sort.startswith(("deal_", "fair_", "profit_"))

    query = select(Listing)
    count_query = select(func.count()).select_from(Listing)
    if needs_prediction:
        pred_join = (Prediction.listing_id == Listing.id) & (
            Prediction.model_version_id == mv.id
        )
        if verdict is not None:
            # A verdict filter narrows the result set.
            query = query.join(Prediction, pred_join)
            count_query = count_query.join(Prediction, pred_join)
            conditions.append(Prediction.deal_verdict == verdict)
        else:
            # Sorting only: keep every row - ones whose prediction is not
            # cached yet simply sort to the end instead of disappearing.
            query = query.outerjoin(Prediction, pred_join)

    for condition in conditions:
        query = query.where(condition)
        count_query = count_query.where(condition)

    if sort.startswith("deal_") and mv is not None:
        order = (
            Prediction.deal_score.desc().nulls_last()
            if sort == "deal_best"
            else Prediction.deal_score.asc().nulls_last()
        )
    elif sort.startswith("profit_") and mv is not None:
        # Profit in EUR: fair price minus asking price (positive = good deal).
        # Rows without a deal verdict (placeholder prices) go last.
        profit = Prediction.fair_price_eur - Listing.price_eur
        order = (
            Prediction.deal_score.is_(None),
            nullslast(desc(profit) if sort == "profit_best" else asc(profit)),
        )
    elif sort.startswith("fair_") and mv is not None:
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

    if not isinstance(order, tuple):
        order = (order,)
    total = session.exec(count_query).one()
    rows = session.exec(query.order_by(*order).offset(offset).limit(limit)).all()
    return {"total": total, "items": _enriched(rows, session)}


@router.get("/{listing_id}/similar")
def similar_listings(
    listing_id: int,
    session: Session = Depends(get_session),
    limit: int = Query(8, ge=1, le=20),
) -> dict:
    """Same make and model offers, closest in year, mileage and power."""
    row = session.get(Listing, listing_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Listing not found")

    distance = (
        func.abs(Listing.year - row.year)
        + func.abs(func.coalesce(Listing.mileage_km, 0) - (row.mileage_km or 0)) / 10000.0
        + func.abs(func.coalesce(Listing.power_kw, 0) - (row.power_kw or 0)) / 20.0
    )
    rows = session.exec(
        select(Listing)
        .where(
            Listing.id != row.id,
            Listing.make == row.make,
            Listing.model == row.model,
            Listing.status == "active",
        )
        .order_by(distance)
        .limit(limit)
    ).all()
    return {"total": len(rows), "items": _enriched(rows, session)}


@router.get("/{listing_id}")
def get_listing(listing_id: int, session: Session = Depends(get_session)) -> dict:
    row = session.get(Listing, listing_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    item = _enriched([row], session)[0]
    # Local explanation: baseline price + per-feature impacts (they add up to
    # the fair price).
    artifact = active_artifact(session)
    if artifact is not None:
        car = {k: getattr(row, k) for k in CAR_FIELDS}
        explained = explain_instance(artifact, car)
        item["explanation"] = explained["explanation"]
        item["baseline_price_eur"] = explained["baseline_price_eur"]
    return item
