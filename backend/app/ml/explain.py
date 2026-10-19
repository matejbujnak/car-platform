"""Model explainability using LightGBM's built-in TreeSHAP values.

No extra dependency needed: LightGBM computes exact SHAP values for tree
ensembles natively (``pred_contrib=True``). The model predicts log prices, so
each feature contribution is multiplicative - we convert it to a EUR impact
relative to the fair price, which is what people intuitively want to see.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.ml.features import CATEGORICAL, CURRENT_YEAR, NUMERIC, add_features

# Raw listing fields a prediction needs (kept in sync with app.ml.predict).
RAW_FIELDS = [
    "make", "model", "year", "mileage_km", "fuel", "power_kw",
    "engine_cc", "gearbox", "body", "drive", "seller_type",
]

# Derived model features are grouped into human concepts; each group shows the
# raw field that makes sense to the user.
FEATURE_GROUPS = {
    "car_age": ("Age", "year"),
    "car_age_sq": ("Age", "year"),
    "log_mileage": ("Mileage", "mileage_km"),
    "mileage_per_year": ("Mileage", "mileage_km"),
    "power_kw": ("Power", "power_kw"),
    "log_power": ("Power", "power_kw"),
    "power_per_cc": ("Power", "power_kw"),
    "engine_cc": ("Engine size", "engine_cc"),
    "make": ("Make", "make"),
    "model": ("Model", "model"),
    "fuel": ("Fuel", "fuel"),
    "gearbox": ("Gearbox", "gearbox"),
    "body": ("Body", "body"),
    "drive": ("Drive", "drive"),
    "seller_type": ("Seller", "seller_type"),
}


def _feature_columns(artifact: dict) -> list[tuple[str, str | None]]:
    """(feature, category) for every column of the transformed matrix."""
    pipeline = artifact["pipeline"]
    pre = pipeline.named_steps["pre"]
    columns: list[tuple[str, str | None]] = []
    ohe = pre.named_transformers_["cat"]
    for feature, categories in zip(CATEGORICAL, ohe.categories_):
        for category in categories:
            columns.append((feature, str(category)))
    columns.extend((feature, None) for feature in NUMERIC)
    return columns


def _shap_values(artifact: dict, cars: list[dict]) -> tuple[np.ndarray, float, np.ndarray]:
    """TreeSHAP values in log-price space: (contributions, base, log predictions)."""
    pipeline = artifact["pipeline"]
    frame = add_features(pd.DataFrame(cars), CURRENT_YEAR)
    transformed = pipeline.named_steps["pre"].transform(frame[CATEGORICAL + NUMERIC])
    booster = pipeline.named_steps["model"].booster_
    raw = booster.predict(transformed, pred_contrib=True)
    if hasattr(raw, "toarray"):  # sparse input -> sparse contributions
        raw = raw.toarray()
    contribs = np.asarray(raw).reshape(len(cars), -1)
    shap = contribs[:, :-1]
    base = float(contribs[0, -1])
    log_pred = base + shap.sum(axis=1)
    return shap, base, np.asarray(log_pred).reshape(-1)


def _group_impacts(
    artifact: dict, shap_row: np.ndarray, fair_price: float, car: dict
) -> list[dict]:
    totals: dict[str, float] = {}
    for (feature, _category), value in zip(_feature_columns(artifact), shap_row):
        group, _ = FEATURE_GROUPS.get(feature, (feature, feature))
        totals[group] = totals.get(group, 0.0) + float(value)

    value_fields = {group: field for group, field in FEATURE_GROUPS.values()}
    items = []
    for group, total in totals.items():
        if abs(total) < 1e-9:
            continue
        items.append(
            {
                "feature": group,
                "value": str(car.get(value_fields.get(group, group), "—") or "—"),
                # Multiplicative SHAP -> EUR impact on the fair price.
                "impact_eur": round(fair_price * (np.exp(total) - 1)),
            }
        )
    items.sort(key=lambda item: abs(item["impact_eur"]), reverse=True)
    return items


def explain_instance(artifact: dict, car: dict, top: int = 6) -> list[dict]:
    """Top reasons why this car's fair price is what it is (EUR impact)."""
    shap, _base, log_pred = _shap_values(artifact, [car])
    fair_price = float(np.exp(float(log_pred[0])))
    return _group_impacts(artifact, shap[0], fair_price, car)[:top]


def global_importance(artifact: dict, cars: list[dict], top: int = 12) -> list[list]:
    """Overall feature importance: mean |SHAP| grouped by concept, as fractions."""
    shap, _base, _pred = _shap_values(artifact, cars)
    mean_abs = np.abs(shap).mean(axis=0)

    totals: dict[str, float] = {}
    for (feature, _category), value in zip(_feature_columns(artifact), mean_abs):
        group, _ = FEATURE_GROUPS.get(feature, (feature, feature))
        totals[group] = totals.get(group, 0.0) + float(value)

    overall = sum(totals.values()) or 1.0
    ranked = sorted(totals.items(), key=lambda kv: kv[1], reverse=True)
    return [[group, round(value / overall, 4)] for group, value in ranked[:top]]
