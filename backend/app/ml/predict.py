"""Prediction helpers: fair price + interval for a single car."""

from functools import lru_cache

import joblib
import pandas as pd

from app.ml.features import CATEGORICAL, NUMERIC, add_features
from app.ml.train import YEAR_MAX


@lru_cache(maxsize=4)
def load_artifact(path: str) -> dict:
    """Load a trained artifact (cached in memory)."""
    return joblib.load(path)


def predict_price(artifact: dict, car: dict) -> dict:
    """Fair price and its prediction interval for one car (raw listing fields).

    `car` needs: make, model, year, mileage_km, fuel, power_kw, engine_cc,
    gearbox, body, drive, seller_type.
    """
    frame = add_features(pd.DataFrame([car]), YEAR_MAX)
    price = float(artifact["pipeline"].predict(frame[CATEGORICAL + NUMERIC])[0])
    q = float(artifact["conformal_q"])
    return {
        "fair_price_eur": round(price),
        "interval_low_eur": round(max(price - q, 0)),
        "interval_high_eur": round(price + q),
        "model_name": artifact["model_name"],
    }


def deal_verdict(price_eur: float, prediction: dict) -> tuple[str, float]:
    """Classify a listing price against the prediction interval.

    Returns (verdict, deal_score); deal_score > 0 means cheaper than fair.
    """
    fair = prediction["fair_price_eur"]
    score = (fair - price_eur) / fair if fair else 0.0
    if price_eur < prediction["interval_low_eur"]:
        verdict = "cheap"
    elif price_eur > prediction["interval_high_eur"]:
        verdict = "overpriced"
    else:
        verdict = "fair"
    return verdict, round(score, 4)
