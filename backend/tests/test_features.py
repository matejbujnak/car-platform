"""Feature engineering units."""

import pandas as pd

from app.ml.features import (
    NUMERIC,
    add_features,
    build_segment_stats,
    plausible_price,
    segment_row,
    simplify_gearbox,
)


def test_simplify_gearbox():
    assert simplify_gearbox("6-st. manuálna") == "manual"
    assert simplify_gearbox("8-st. automatická") == "automatic"
    assert simplify_gearbox(None) == "unknown"
    assert simplify_gearbox("nezaradené") == "unknown"


def test_plausible_price():
    assert plausible_price(10_000)
    assert not plausible_price(0)          # placeholder "price on request"
    assert not plausible_price(None)
    assert not plausible_price(10**7)      # joke listing


def test_segment_stats_fallbacks():
    df = pd.DataFrame(
        [
            {"make": "Skoda", "model": "Octavia", "price_eur": 15_000, "mileage_km": 100_000},
            {"make": "Skoda", "model": "Octavia", "price_eur": 20_000, "mileage_km": 80_000},
            {"make": "BMW", "model": "X5", "price_eur": 60_000, "mileage_km": 50_000},
        ]
    )
    stats = build_segment_stats(df)

    octavia = segment_row(stats, "Skoda", "Octavia")
    assert octavia["supply"] == 2
    assert octavia["median_price"] == 17_500

    # Unknown model falls back to the make level...
    skoda_other = segment_row(stats, "Skoda", "Superb")
    assert skoda_other["supply"] == 2
    # ...and a fully unknown make falls back to the global stats.
    assert segment_row(stats, "Dacia", "Duster")["supply"] == 3
    assert segment_row(None, "Skoda", "Octavia") is None


def test_add_features_produces_all_numeric_columns():
    df = pd.DataFrame(
        [
            {
                "make": "Skoda",
                "model": "Octavia",
                "year": 2020,
                "mileage_km": 120_000,
                "power_kw": 110,
                "engine_cc": 2000,
                "fuel": "Diesel",
                "gearbox": "6-st. manuálna",
                "body": "Combi",
                "drive": "Predný",
                "seller_type": "dealer",
                "price_eur": 16_000,
            }
        ]
    )
    stats = build_segment_stats(df)
    featured = add_features(df, 2026, stats)

    for col in NUMERIC:
        assert col in featured.columns, col
    assert featured.loc[0, "segment_median_price"] == 16_000
    assert featured.loc[0, "segment_supply"] == 1
    assert featured.loc[0, "car_age"] == 6
