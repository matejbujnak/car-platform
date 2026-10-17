"""Train the fair-price model and register it in the database.

Compares a linear baseline (Ridge) with gradient boosting (LightGBM), picks the
better one by MAE and computes an 80% prediction interval with split conformal
prediction. The winning pipeline is saved as an artifact and registered in the
modelversion table (the API serves predictions from the active version).

Usage:
    python -m app.ml.train              # trains on listings in the database
    python -m app.ml.train cars.csv     # trains on an export CSV instead
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Cap worker threads BEFORE importing numpy / sklearn / lightgbm. Each of these
# spins up its own OpenMP/BLAS thread pool; on a many-core CPU the pools
# oversubscribe and can deadlock (training "hangs" randomly). One fixed thread
# count keeps them cooperating.
N_JOBS = max(1, (os.cpu_count() or 4) // 2)
for _var in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
    os.environ.setdefault(_var, str(N_JOBS))

import joblib
import numpy as np
import pandas as pd
from lightgbm import LGBMRegressor
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from app import config
from app.db.models import ModelVersion
from app.db.session import engine
from app.ml.features import (
    CATEGORICAL,
    CURRENT_YEAR,
    NUMERIC,
    PRICE_MAX,
    PRICE_MIN,
    add_features,
    plausible_price,
    simplify_gearbox,
)
from sqlmodel import Session, select

RANDOM_STATE = 42
TARGET = "price_eur"

# Cleaning bounds (bad rows poison the model). PRICE_MIN/MAX come from
# app.ml.features so training and deal scoring agree.
YEAR_MIN, YEAR_MAX = 1990, CURRENT_YEAR
MILEAGE_MAX = 500_000

# Split conformal: interval covers ~80% of the residuals on held-out data.
INTERVAL_COVERAGE = 0.80


# --- data -------------------------------------------------------------------

def load_data(csv_path: str | None) -> pd.DataFrame:
    if csv_path:
        df = pd.read_csv(csv_path)
        if TARGET not in df.columns and "last_price_eur" in df.columns:
            df = df.rename(columns={"last_price_eur": TARGET})
    else:
        query = (
            "SELECT make, model, year, mileage_km, fuel, power_kw, engine_cc, "
            "gearbox, body, drive, seller_type, price_eur FROM listing"
        )
        df = pd.read_sql(query, engine)
    print(f"Loaded {len(df):,} rows from {'CSV' if csv_path else 'database'}")
    return df


def clean(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy().replace("", np.nan)
    for col in [TARGET, "year", "mileage_km", "power_kw", "engine_cc"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    n0 = len(df)
    dedup_cols = [c for c in ["make", "model", "year", "mileage_km", "power_kw", TARGET] if c in df.columns]
    df = df.drop_duplicates(subset=dedup_cols)
    df = df[df[TARGET].notna() & (df[TARGET] > PRICE_MIN) & (df[TARGET] <= PRICE_MAX)]
    df = df[df["year"].between(YEAR_MIN, YEAR_MAX)]
    df = df[(df["mileage_km"].isna()) | (df["mileage_km"] <= MILEAGE_MAX)]
    df["gearbox"] = df["gearbox"].apply(simplify_gearbox)
    print(f"Cleaned: {len(df):,} rows (dropped {n0 - len(df):,})")
    return df


# --- models -----------------------------------------------------------------

def build_pipelines() -> dict[str, Pipeline]:
    """Two models sharing the same preprocessing, so they are comparable."""
    pre = ColumnTransformer(
        [
            ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL),
            ("num", StandardScaler(), NUMERIC),
        ]
    )
    return {
        "ridge": Pipeline([("pre", pre), ("model", Ridge(alpha=1.0, random_state=RANDOM_STATE))]),
        "lightgbm": Pipeline(
            [
                ("pre", pre),
                (
                    "model",
                    LGBMRegressor(
                        n_estimators=600,
                        learning_rate=0.05,
                        num_leaves=31,
                        random_state=RANDOM_STATE,
                        n_jobs=N_JOBS,
                        verbose=-1,
                    ),
                ),
            ]
        ),
    }


def metrics(y_true, y_pred) -> dict[str, float]:
    mape = float(np.mean(np.abs((y_true - y_pred) / y_true)) * 100)
    within_20 = float(np.mean(np.abs(y_true - y_pred) / y_true <= 0.20) * 100)
    return {
        "mae": round(float(mean_absolute_error(y_true, y_pred)), 1),
        "rmse": round(float(np.sqrt(mean_squared_error(y_true, y_pred))), 1),
        "r2": round(float(r2_score(y_true, y_pred)), 4),
        "mape_pct": round(mape, 2),
        "within_20pct": round(within_20, 1),
    }


# --- training ---------------------------------------------------------------

def train(csv_path: str | None = None) -> None:
    df = add_features(clean(load_data(csv_path)), YEAR_MAX)
    if len(df) < 200:
        raise SystemExit(
            f"Need at least 200 cleaned rows to train, got {len(df)}. "
            "Scrape more data first (POST /api/admin/scrape/full)."
        )

    y = df[TARGET]
    x = df[CATEGORICAL + NUMERIC]

    # 60% train / 20% calibration (conformal) / 20% test.
    x_train, x_test, y_train, y_test = train_test_split(
        x, y, test_size=0.20, random_state=RANDOM_STATE
    )
    x_train, x_cal, y_train, y_cal = train_test_split(
        x_train, y_train, test_size=0.25, random_state=RANDOM_STATE
    )
    print(f"Split: {len(x_train):,} train / {len(x_cal):,} calibration / {len(x_test):,} test")

    results: dict[str, dict] = {}
    fitted: dict[str, Pipeline] = {}
    for name, pipeline in build_pipelines().items():
        pipeline.fit(x_train, y_train)
        pred = pipeline.predict(x_test)
        results[name] = metrics(y_test.to_numpy(), pred)
        fitted[name] = pipeline
        print(f"{name:>10}: {results[name]}")

    best_name = min(results, key=lambda n: results[n]["mae"])
    best = fitted[best_name]
    print(f"Best model: {best_name}")

    # Split conformal prediction: q = residual quantile on the calibration set.
    cal_residuals = np.abs(y_cal.to_numpy() - best.predict(x_cal))
    conformal_q = float(np.quantile(cal_residuals, INTERVAL_COVERAGE))
    print(f"{int(INTERVAL_COVERAGE * 100)}% interval: +/- {conformal_q:,.0f} EUR")

    save_artifact(best, best_name, results[best_name], conformal_q, len(df))


def save_artifact(
    pipeline: Pipeline,
    model_name: str,
    metrics_: dict[str, float],
    conformal_q: float,
    rows: int,
) -> None:
    os.makedirs(config.MODEL_DIR, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    name = f"{model_name}_{stamp}"
    path = Path(config.MODEL_DIR) / f"{name}.joblib"

    joblib.dump(
        {
            "pipeline": pipeline,
            "model_name": model_name,
            "metrics": metrics_,
            "conformal_q": conformal_q,
            "features": {"numeric": NUMERIC, "categorical": CATEGORICAL},
            "trained_at": stamp,
        },
        path,
    )

    with Session(engine) as session:
        for old in session.exec(
            select(ModelVersion).where(ModelVersion.is_active == True)  # noqa: E712
        ).all():
            old.is_active = False
            session.add(old)
        session.add(
            ModelVersion(
                name=name,
                artifact_path=str(path),
                dataset_rows=rows,
                metrics={**metrics_, "conformal_q": round(conformal_q, 1)},
                is_active=True,
            )
        )
        session.commit()

    print(f"Saved and registered model: {path}")


if __name__ == "__main__":
    train(sys.argv[1] if len(sys.argv) > 1 else None)
