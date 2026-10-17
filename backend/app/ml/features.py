"""Feature engineering for the fair-price model."""

from datetime import datetime, timezone

import numpy as np
import pandas as pd

CURRENT_YEAR = datetime.now(timezone.utc).year

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


def add_features(df: pd.DataFrame, current_year: int) -> pd.DataFrame:
    """Add model features to a frame with the raw listing columns."""
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
    return df
