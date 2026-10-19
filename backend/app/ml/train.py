"""Train the fair-price models and register them in the database.

The market is not homogeneous - a budget city car and a luxury coupe follow
different pricing rules - so the makes are split into price tiers (by their
median price in the data) and each tier gets:

- its own LightGBM model (trained on log prices, so errors stay relative),
- its own split-conformal prediction interval (the budget tier really is less
  predictable than the middle of the market - the intervals say so honestly),
- its own feature importances for explainability.

A Ridge regression is fitted per tier as a sanity baseline. The winning
pipelines are saved as one artifact and registered in the modelversion table
(the API routes each car to its tier's model).

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
from app.ml.explain import RAW_FIELDS, global_importance
from app.ml.features import (
    CATEGORICAL,
    CURRENT_YEAR,
    NUMERIC,
    PRICE_MAX,
    PRICE_MIN,
    add_features,
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

# Market tiers: makes are grouped by their median price (data-driven), the
# top tier gets the luxury name. A tier with too few rows falls back to the
# default tier at prediction time.
TIER_NAMES = ["budget", "mid", "premium", "luxury"]
MIN_TIER_ROWS = 500


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


def assign_tiers(df: pd.DataFrame) -> dict[str, str]:
    """Group makes into price tiers (data-driven).

    Makes are ordered by their median price and cut into tiers so that each
    tier holds a comparable number of cars - the tier is decided by the make,
    which is known at prediction time.
    """
    medians = df.groupby("make")[TARGET].median().sort_values()
    counts = df["make"].value_counts()
    target_rows = len(df) / len(TIER_NAMES)
    remaining_rows = {make: int(counts.get(make, 0)) for make in medians.index}

    tier_of: dict[str, str] = {}
    tier_idx = 0
    acc = 0
    makes = list(medians.index)
    for i, make in enumerate(makes):
        tier_of[make] = TIER_NAMES[min(tier_idx, len(TIER_NAMES) - 1)]
        acc += remaining_rows[make]
        # Cut to the next tier when this one is "full", but always leave at
        # least one make for each remaining tier.
        makes_left = len(makes) - i - 1
        tiers_left = len(TIER_NAMES) - tier_idx - 1
        if acc >= target_rows and makes_left >= tiers_left:
            tier_idx += 1
            acc = 0
    return tier_of


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

    tier_of = assign_tiers(df)
    df["_tier"] = df["make"].map(tier_of)
    sizes = df["_tier"].value_counts().to_dict()
    print("Tier sizes:", {t: int(sizes.get(t, 0)) for t in TIER_NAMES})

    tiers_out: dict[str, dict] = {}
    all_true: list[np.ndarray] = []
    all_pred: list[np.ndarray] = []

    for tier in TIER_NAMES:
        sub = df[df["_tier"] == tier]
        if len(sub) < MIN_TIER_ROWS:
            print(f"tier '{tier}': only {len(sub)} rows - skipped "
                  f"(falls back to the default tier)")
            continue

        # The model learns LOG prices: errors are then relative (the same
        # percentage accuracy on cheap and expensive cars).
        y_log = np.log(sub[TARGET])
        y_price = sub[TARGET]
        x = sub[CATEGORICAL + NUMERIC]

        x_train, x_test, y_train_log, y_test_log, y_train_price, y_test_price = (
            train_test_split(x, y_log, y_price, test_size=0.20, random_state=RANDOM_STATE)
        )
        x_train, x_cal, y_train_log, y_cal_log, _, _ = train_test_split(
            x_train, y_train_log, y_train_price, test_size=0.25, random_state=RANDOM_STATE
        )

        results: dict[str, dict] = {}
        fitted: dict[str, Pipeline] = {}
        for name, pipeline in build_pipelines().items():
            pipeline.fit(x_train, y_train_log)
            pred_price = np.exp(pipeline.predict(x_test))
            results[name] = metrics(y_test_price.to_numpy(), pred_price)
            fitted[name] = pipeline
            print(f"  tier '{tier}' {name:>10}: {results[name]}")

        # Ridge is the sanity baseline; LightGBM is the production model (it
        # wins on this data and supports exact SHAP explanations).
        best_name = "lightgbm"
        best = fitted[best_name]
        pred_price = np.exp(best.predict(x_test))
        all_true.append(y_test_price.to_numpy())
        all_pred.append(pred_price)

        # Per-tier conformal interval in log space: a RELATIVE error that
        # scales with the price and honestly reflects the tier's predictability.
        cal_residuals = np.abs(y_cal_log.to_numpy() - best.predict(x_cal))
        conformal_q_log = float(np.quantile(cal_residuals, INTERVAL_COVERAGE))

        sample = sub[RAW_FIELDS].sample(min(2000, len(sub)), random_state=RANDOM_STATE)
        importance = global_importance(best, sample.to_dict("records"))

        print(f"tier '{tier}' ({len(sub):,} rows): {best_name} {results[best_name]} "
              f"interval +/- {(np.exp(conformal_q_log) - 1) * 100:.1f}%")

        tiers_out[tier] = {
            "pipeline": best,
            "conformal_q_log": conformal_q_log,
            "metrics": results[best_name],
            "rows": int(len(sub)),
            "importance": importance,
            "model_name": f"{best_name}_{tier}",
        }

    if not tiers_out:
        raise SystemExit("No tier had enough rows to train on.")

    # Overall metrics over all tier test sets (for the registry headline).
    overall = metrics(np.concatenate(all_true), np.concatenate(all_pred))
    # Unknown makes fall back to the middle of the market by default.
    default_tier = "mid" if "mid" in tiers_out else max(tiers_out, key=lambda t: tiers_out[t]["rows"])
    print(f"Overall: {overall} (default tier: {default_tier})")

    save_artifact(tiers_out, tier_of, default_tier, overall, len(df))


def save_artifact(
    tiers_out: dict[str, dict],
    tier_of: dict[str, str],
    default_tier: str,
    overall: dict[str, float],
    rows: int,
) -> None:
    os.makedirs(config.MODEL_DIR, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    name = f"tiers_{stamp}"
    path = Path(config.MODEL_DIR) / f"{name}.joblib"

    joblib.dump(
        {
            "log_target": True,
            "model_name": name,
            "tiers": {
                tier: {
                    "pipeline": data["pipeline"],
                    "conformal_q_log": data["conformal_q_log"],
                    "model_name": data["model_name"],
                }
                for tier, data in tiers_out.items()
            },
            "make_tier": tier_of,
            "default_tier": default_tier,
            "global_importance": tiers_out[default_tier]["importance"],
            "trained_at": stamp,
        },
        path,
    )

    tier_metrics = {
        tier: {
            "rows": data["rows"],
            "mae": data["metrics"]["mae"],
            "r2": data["metrics"]["r2"],
            "mape_pct": data["metrics"]["mape_pct"],
            "interval_pct": round((np.exp(data["conformal_q_log"]) - 1) * 100, 1),
            "top_features": data["importance"],
        }
        for tier, data in tiers_out.items()
    }

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
                metrics={
                    **overall,
                    "default_tier": default_tier,
                    "tiers": tier_metrics,
                    "top_features": tiers_out[default_tier]["importance"],
                },
                is_active=True,
            )
        )
        session.commit()

    # Predictions for the new model version are computed in the background.
    from app.scraping import jobs

    jobs.enqueue({"type": "backfill_predictions"})
    print(f"Saved and registered model: {path}")


if __name__ == "__main__":
    train(sys.argv[1] if len(sys.argv) > 1 else None)
