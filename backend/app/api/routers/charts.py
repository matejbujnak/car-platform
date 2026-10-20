"""Market overview aggregates for the Charts page."""

from fastapi import APIRouter, Depends
from sqlalchemy import case, func
from sqlmodel import Session, select

from app.db.models import Listing, Prediction
from app.db.session import get_session
from app.ml.predict import active_model

router = APIRouter(prefix="/api/charts", tags=["charts"])

# Charts describe real sale offers - placeholders and rentals are excluded.
BASE_FILTERS = (
    Listing.status == "active",
    Listing.offer_type == "sale",
    Listing.price_eur >= 500,
    Listing.price_eur <= 200_000,
)

PRICE_BUCKETS = [
    ("0–5k", 0, 5_000),
    ("5–10k", 5_000, 10_000),
    ("10–15k", 10_000, 15_000),
    ("15–20k", 15_000, 20_000),
    ("20–30k", 20_000, 30_000),
    ("30–50k", 30_000, 50_000),
    ("50–100k", 50_000, 100_000),
    ("100k+", 100_000, 10**9),
]

MILEAGE_BUCKETS = [
    ("0–50k", 0, 50_000),
    ("50–100k", 50_000, 100_000),
    ("100–150k", 100_000, 150_000),
    ("150–200k", 150_000, 200_000),
    ("200k+", 200_000, 10**9),
]


def _bucket_case(buckets, column):
    return case(
        *[(column < hi, label) for label, _lo, hi in buckets],
        else_=buckets[-1][0],
    )


@router.get("")
def charts(session: Session = Depends(get_session)) -> dict:
    count = func.count()

    def bucket_counts(buckets, column):
        label = _bucket_case(buckets, column).label("bucket")
        rows = session.exec(
            select(label, count).where(*BASE_FILTERS).group_by(label)
        ).all()
        found = {row[0]: row[1] for row in rows}
        return [{"label": name, "value": int(found.get(name, 0))} for name, _lo, _hi in buckets]

    def group_stats(column, limit: int):
        rows = session.exec(
            select(column, count, func.avg(Listing.price_eur))
            .where(*BASE_FILTERS)
            .group_by(column)
            .order_by(count.desc())
            .limit(limit)
        ).all()
        return [
            {"label": str(row[0] or "—"), "value": int(row[1]), "avg_price": round(float(row[2] or 0))}
            for row in rows
        ]

    price_by_year = session.exec(
        select(Listing.year, count, func.avg(Listing.price_eur))
        .where(*BASE_FILTERS)
        .group_by(Listing.year)
        .order_by(Listing.year)
    ).all()

    power_buckets = [
        ("–70 kW", 0, 70),
        ("70–110", 70, 110),
        ("110–150", 110, 150),
        ("150–250", 150, 250),
        ("250+ kW", 250, 10**9),
    ]
    power_rows = {
        row[0]: row
        for row in session.exec(
            select(
                _bucket_case(power_buckets, Listing.power_kw).label("bucket"),
                count,
                func.avg(Listing.price_eur),
            )
            .where(*BASE_FILTERS)
            .group_by("bucket")
        ).all()
    }
    power_price = [
        {
            "label": name,
            "value": int(power_rows[name][1]) if name in power_rows else 0,
            "avg_price": round(float(power_rows[name][2] or 0)) if name in power_rows else 0,
        }
        for name, _lo, _hi in power_buckets
    ]

    seller_rows = session.exec(
        select(Listing.seller_type, count, func.avg(Listing.price_eur))
        .where(*BASE_FILTERS)
        .group_by(Listing.seller_type)
    ).all()
    seller_mix = [
        {
            "label": {"dealer": "Dealer", "private": "Private"}.get(str(row[0]), "Unknown"),
            "value": int(row[1]),
            "avg_price": round(float(row[2] or 0)),
        }
        for row in seller_rows
    ]

    model_rows = session.exec(
        select(Listing.make, Listing.model, count, func.avg(Listing.price_eur))
        .where(*BASE_FILTERS)
        .group_by(Listing.make, Listing.model)
        .order_by(count.desc())
        .limit(10)
    ).all()
    top_models = [
        {
            "label": f"{make} {model}",
            "value": int(total),
            "avg_price": round(float(avg or 0)),
        }
        for make, model, total, avg in model_rows
    ]

    # New offers per week (grouped in Python to stay database-agnostic).
    weeks: dict[str, int] = {}
    for seen in session.exec(select(Listing.first_seen).where(*BASE_FILTERS)).all():
        iso = seen.isocalendar()
        key = f"{iso[0]}-W{iso[1]:02d}"
        weeks[key] = weeks.get(key, 0) + 1
    new_listings = [
        {"label": key, "value": value}
        for key, value in sorted(weeks.items())[-10:]
    ]

    # Distribution of deal scores (how far prices sit from the fair price).
    mv = active_model(session)
    score_buckets = [
        ("< −30%", -10**9, -30),
        ("−30/−20", -30, -20),
        ("−20/−10", -20, -10),
        ("−10/0", -10, 0),
        ("0/10%", 0, 10),
        ("10/20%", 10, 20),
        ("20/30%", 20, 30),
        ("> 30%", 30, 10**9),
    ]
    deal_scores = {"< −30%": 0, "−30/−20": 0, "−20/−10": 0, "−10/0": 0, "0/10%": 0, "10/20%": 0, "20/30%": 0, "> 30%": 0}
    if mv is not None:
        score_expr = Prediction.deal_score * 100
        score_rows = session.exec(
            select(_bucket_case(score_buckets, score_expr).label("bucket"), count)
            .join(Listing, Prediction.listing_id == Listing.id)
            .where(
                Prediction.model_version_id == mv.id,
                Prediction.deal_score.is_not(None),
                *BASE_FILTERS,
            )
            .group_by("bucket")
        ).all()
        for bucket, total in score_rows:
            if bucket in deal_scores:
                deal_scores[bucket] = int(total)

    verdicts = {"cheap": 0, "fair": 0, "overpriced": 0, "suspicious": 0}
    if mv is not None:
        rows = session.exec(
            select(Prediction.deal_verdict, count)
            .join(Listing, Prediction.listing_id == Listing.id)
            .where(
                Prediction.model_version_id == mv.id,
                *BASE_FILTERS,
            )
            .group_by(Prediction.deal_verdict)
        ).all()
        for verdict, total in rows:
            if verdict in verdicts:
                verdicts[verdict] = int(total)

    mileage_rows = session.exec(
        select(
            _bucket_case(MILEAGE_BUCKETS, Listing.mileage_km).label("bucket"),
            count,
            func.avg(Listing.price_eur),
        )
        .where(*BASE_FILTERS)
        .group_by("bucket")
    ).all()
    mileage_found = {row[0]: row for row in mileage_rows}

    return {
        "price_histogram": bucket_counts(PRICE_BUCKETS, Listing.price_eur),
        "mileage_price": [
            {
                "label": name,
                "value": int(mileage_found[name][1]) if name in mileage_found else 0,
                "avg_price": round(float(mileage_found[name][2] or 0)) if name in mileage_found else 0,
            }
            for name, _lo, _hi in MILEAGE_BUCKETS
        ],
        "price_by_year": [
            {"label": str(year), "value": int(total), "avg_price": round(float(avg or 0))}
            for year, total, avg in price_by_year
            if year is not None
        ],
        "top_makes": group_stats(Listing.make, 12),
        "top_models": top_models,
        "bodies": group_stats(Listing.body, 8),
        "fuels": group_stats(Listing.fuel, 8),
        "power_price": power_price,
        "seller_mix": seller_mix,
        "new_listings": new_listings,
        "deal_scores": [{"label": key, "value": value} for key, value in deal_scores.items()],
        "verdicts": [{"label": key, "value": value} for key, value in verdicts.items()],
    }
