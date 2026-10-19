"""Prediction helpers: fair price + interval for one car or a batch.

Artifacts come in two shapes:
- tiered (new): {"tiers": {name: {pipeline, conformal_q_log}}, "make_tier": ...}
  - each car is routed to its market tier's model;
- single pipeline (legacy): {"pipeline": ..., ...}.
"""

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


def model_for(artifact: dict, car: dict) -> dict:
    """The model bundle that should price this car (tier routing)."""
    if "tiers" in artifact:
        tier = artifact["make_tier"].get(str(car.get("make")), artifact["default_tier"])
        return artifact["tiers"].get(tier) or artifact["tiers"][artifact["default_tier"]]
    return artifact


def tier_name(artifact: dict, car: dict) -> str | None:
    if "tiers" not in artifact:
        return None
    tier = artifact["make_tier"].get(str(car.get("make")), artifact["default_tier"])
    return tier if tier in artifact["tiers"] else artifact["default_tier"]


def _prediction(model: dict, value: float) -> dict:
    if "conformal_q_log" in model or model.get("log_target"):
        # Log-price model: the interval is relative and scales with the price.
        price = float(np.exp(value))
        q = float(model.get("conformal_q_log", 0.0))
        return {
            "fair_price_eur": round(price),
            "interval_low_eur": round(price * np.exp(-q)),
            "interval_high_eur": round(price * np.exp(q)),
        }
    # Legacy artifact: absolute prices with a fixed interval.
    price = float(value)
    q = float(model.get("conformal_q", 0.0))
    return {
        "fair_price_eur": round(price),
        "interval_low_eur": round(max(price - q, 0)),
        "interval_high_eur": round(price + q),
    }


def predict_prices(artifact: dict, cars: list[dict]) -> list[dict]:
    """Fair price and prediction interval for each car (raw listing fields)."""
    frame = add_features(
        pd.DataFrame(cars), CURRENT_YEAR, artifact.get("segment_stats")
    )
    out: list[dict | None] = [None] * len(cars)

    # Group cars by the model that prices them (tier routing) and predict in
    # batches, then restore the original order.
    groups: dict[int, list[int]] = {}
    models: dict[int, dict] = {}
    for i, car in enumerate(cars):
        model = model_for(artifact, car)
        key = id(model)
        groups.setdefault(key, []).append(i)
        models[key] = model

    for key, indexes in groups.items():
        model = models[key]
        raw = model["pipeline"].predict(
            frame.iloc[indexes][CATEGORICAL + NUMERIC]
        )
        for i, value in zip(indexes, raw):
            out[i] = _prediction(model, float(value))

    return [item for item in out if item is not None]


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
