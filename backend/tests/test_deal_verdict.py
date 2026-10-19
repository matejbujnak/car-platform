"""Deal scoring rules."""

from app.ml.predict import deal_verdict


def _prediction(low: float = 8_000, fair: float = 10_000, high: float = 12_000) -> dict:
    return {"fair_price_eur": fair, "interval_low_eur": low, "interval_high_eur": high}


def test_below_interval_is_a_good_deal():
    verdict, score = deal_verdict(7_500, _prediction())
    assert verdict == "cheap"
    assert score > 0


def test_above_interval_is_overpriced():
    verdict, score = deal_verdict(13_000, _prediction())
    assert verdict == "overpriced"
    assert score < 0


def test_inside_interval_is_fair():
    verdict, _ = deal_verdict(10_500, _prediction())
    assert verdict == "fair"


def test_placeholder_prices_are_flagged_not_deals():
    # A "price" far below anything plausible is a leasing rate, not a deal.
    verdict, score = deal_verdict(1_000, _prediction())
    assert verdict == "suspicious"
    assert score is None
