"""Prediction helpers: fair price + interval for one car or a batch."""

from functools import lru_cache

import joblib
import numpy as np
import pandas as pd
from sqlmodel import Session, select

from app.db.models import ModelVersion
from app.ml.features import CATEGORICAL, CURRENT_YEAR, NUMERIC, add_features

# Raw listing fields a prediction needs.
CAR_FIELDS = [
    "make", "model", "year", "mileage_km", "fuel", "power_kw",
    "engine_cc", "gearbox", "body", "drive", "seller_type",
]


@lru_cache(maxsize=4)
def load_artifact(path: str) -> dict:
    """Load a trained artifact (cached in memory)."""
    return joblib.load(path)


def active_model(session: Session) -> ModelVersion | None:
    """The active model version, or None when nothing is trained yet."""
    return session.exec(
        select(ModelVersion)
        .where(ModelVersion.is_active == True)  # noqa: E712
        .order_by(ModelVersion.id.desc())
        .limit(1)
    ).first()


def active_artifact(session: Session) -> dict | None:
    """The artifact of the active model version, or None when untrained."""
    mv = active_model(session)
    if mv is None:
        return None
    return load_artifact(mv.artifact_path)


def predict_prices(artifact: dict, cars: list[dict]) -> list[dict]:
    """Fair price and prediction interval for each car (raw listing fields).

    Newer artifacts predict log prices and carry a relative conformal error
    (conformal_q_log) - the interval then scales with the price. Older
    artifacts predict prices directly with a fixed +/- EUR interval.
    """
    frame = add_features(pd.DataFrame(cars), CURRENT_YEAR)
    raw = artifact["pipeline"].predict(frame[CATEGORICAL + NUMERIC])
    return [_prediction(artifact, value) for value in raw]


def _prediction(artifact: dict, value: float) -> dict:
    if artifact.get("log_target"):
        price = float(np.exp(value))
        q = float(artifact["conformal_q_log"])
        return {
            "fair_price_eur": round(price),
            "interval_low_eur": round(price * np.exp(-q)),
            "interval_high_eur": round(price * np.exp(q)),
        }
    # Legacy artifact: absolute prices with a fixed interval.
    price = float(value)
    q = float(artifact.get("conformal_q", 0.0))
    return {
        "fair_price_eur": round(price),
        "interval_low_eur": round(max(price - q, 0)),
        "interval_high_eur": round(price + q),
    }


def predict_price(artifact: dict, car: dict) -> dict:
    return predict_prices(artifact, [car])[0]


def deal_verdict(price_eur: float, prediction: dict) -> tuple[str, float | None]:
    """Classify a listing price against the prediction interval.

    Returns (verdict, deal_score); deal_score > 0 means cheaper than fair.
    Prices far below any plausible value are placeholder/leasing prices, not
    real deals ("suspicious").
    """
    fair = prediction["fair_price_eur"]
    if fair and price_eur < fair * 0.4:
        return "suspicious", None
    score = (fair - price_eur) / fair if fair else 0.0
    if price_eur < prediction["interval_low_eur"]:
        verdict = "cheap"
    elif price_eur > prediction["interval_high_eur"]:
        verdict = "overpriced"
    else:
        verdict = "fair"
    return verdict, round(score, 4)
