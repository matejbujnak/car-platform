"""Feature engineering for the fair-price model."""

from datetime import datetime, timezone

import numpy as np
import pandas as pd

CURRENT_YEAR = datetime.now(timezone.utc).year

# Plausible price bounds (EUR). Listings outside this range are leasing
# placeholders or jokes ("on request", "please ignore") and are excluded from
# training and deal scoring.
PRICE_MIN, PRICE_MAX = 500, 200_000


def plausible_price(price_eur) -> bool:
    return price_eur is not None and PRICE_MIN <= price_eur <= PRICE_MAX


# --- market ("segment") statistics ------------------------------------------

# A (make, model) cohort needs this many rows before its own median is used;
# smaller cohorts fall back to the make level. This avoids the "1-car cohort"
# case where the market median would literally be the car's own price.
MIN_COHORT_ROWS = 5


def build_segment_stats(df: pd.DataFrame) -> dict:
    """Market snapshot: price/size/mileage of each (make, model) cohort.

    Computed from the training rows and saved inside the artifact, so training
    and serving always see the same numbers. Rare models fall back to the
    make-level and then the global statistics.
    """

    def agg(frame: pd.DataFrame) -> dict:
        return {
            "median_price": float(frame["price_eur"].median()),
            "median_mileage": float(frame["mileage_km"].median() or 0),
            "supply": int(len(frame)),
        }

    return {
        "by_model": {
            (str(make), str(model)): agg(frame)
            for (make, model), frame in df.groupby(["make", "model"])
            if len(frame) >= MIN_COHORT_ROWS
        },
        "by_make": {str(make): agg(frame) for make, frame in df.groupby("make")},
        "global": agg(df),
    }


def segment_row(stats: dict | None, make, model) -> dict | None:
    """Cohort statistics for a car (model -> make -> global fallback)."""
    if not stats:
        return None
    row = stats.get("by_model", {}).get((str(make), str(model)))
    if row is None:
        row = stats.get("by_make", {}).get(str(make))
    return row or stats.get("global")

# Numeric features (built from the raw listing columns).
NUMERIC = [
    "car_age",
    "car_age_sq",
    "log_mileage",
    "mileage_per_year",
    "power_kw",
    "log_power",
    "engine_cc",
    "power_per_cc",
    # Market ("segment") context - the model sees the competition around the
    # car, not just the car itself.
    "segment_median_price",
    "segment_supply",
    "mileage_vs_segment",
]

# Categorical features (raw listing columns).
CATEGORICAL = ["make", "model", "fuel", "gearbox", "body", "drive", "seller_type"]


def simplify_gearbox(value) -> str:
    """Normalize gearbox labels ('6-st. manualna' -> 'manual')."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return "unknown"
    s = str(value).lower()
    if "manu" in s:
        return "manual"
    if "auto" in s:
        return "automatic"
    return "unknown"


def add_features(
    df: pd.DataFrame, current_year: int, segment_stats: dict | None = None
) -> pd.DataFrame:
    """Add model features to a frame with the raw listing columns.

    `segment_stats` is the market snapshot from build_segment_stats(); without
    it the market features stay empty (the imputer neutralizes them).
    """
    df = df.copy()
    age = (current_year - df["year"]).clip(lower=0)
    df["car_age"] = age
    df["car_age_sq"] = age**2
    df["log_mileage"] = np.log1p(df["mileage_km"].fillna(0))
    df["mileage_per_year"] = df["mileage_km"].fillna(0) / (age + 1)
    df["power_kw"] = pd.to_numeric(df["power_kw"], errors="coerce").fillna(0)
    df["log_power"] = np.log1p(df["power_kw"])
    df["engine_cc"] = pd.to_numeric(df["engine_cc"], errors="coerce").fillna(0)
    df["power_per_cc"] = df["power_kw"] / df["engine_cc"].replace(0, np.nan)
    df["power_per_cc"] = df["power_per_cc"].fillna(0)

    df["gearbox"] = df["gearbox"].apply(simplify_gearbox)
    for col in CATEGORICAL:
        if col in df.columns:
            df[col] = df[col].fillna("unknown").astype(str)

    # Market context: how the car sits among its competitors.
    resolved = [
        segment_row(segment_stats, make, model)
        for make, model in zip(df["make"], df["model"])
    ]
    df["segment_median_price"] = [r["median_price"] if r else np.nan for r in resolved]
    df["segment_supply"] = [float(r["supply"]) if r else np.nan for r in resolved]
    df["mileage_vs_segment"] = [
        ((mileage or 0) + 1) / ((r["median_mileage"] if r else np.nan) + 1)
        for mileage, r in zip(df["mileage_km"].fillna(0), resolved)
    ]
    return df
