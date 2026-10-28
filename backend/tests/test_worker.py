"""Worker behaviour: the sold marking must not punish failed segments."""

from datetime import datetime, timedelta

from sqlmodel import Session, select

from app.db.models import Listing
from app.worker import _mark_missing_as_sold


def test_sold_marking_skips_failed_segments(session: Session):
    now = datetime.utcnow()
    old = now - timedelta(days=30)

    seen_recently = Listing(
        source_id="seen", url="http://x/seen/", title="Seen", make="Skoda",
        model="Octavia", year=2020, last_seen=now, price_eur=10_000,
    )
    gone_from_ok_segment = Listing(
        source_id="gone", url="http://x/gone/", title="Gone", make="Skoda",
        model="Octavia", year=2020, last_seen=old, price_eur=10_000,
    )
    in_failed_segment = Listing(
        source_id="failed-seg", url="http://x/f/", title="Failed segment", make="Zeekr",
        model="X", year=2026, last_seen=old, price_eur=30_000,
    )
    session.add(seen_recently)
    session.add(gone_from_ok_segment)
    session.add(in_failed_segment)
    session.commit()

    sold = _mark_missing_as_sold(session, now, {"Zeekr|2026"})
    assert sold == 1

    statuses = {
        row.source_id: row.status for row in session.exec(select(Listing)).all()
    }
    assert statuses == {
        "seen": "active",
        "gone": "sold",
        "failed-seg": "active",  # its segment was not crawled - keep it
    }

def test_price_change_refreshes_cached_verdict(session: Session):
    """A crawl that sees a new price must update the cached verdict as well."""
    from app.db.models import ModelVersion, Prediction
    from app.scraping.store import upsert_listings

    listing = Listing(
        source_id="price-1", url="http://x/1/", title="Car", make="Skoda",
        model="Octavia", year=2020, price_eur=5_000,
    )
    session.add(listing)
    session.commit()
    session.refresh(listing)
    mv = ModelVersion(name="m", artifact_path="/x", dataset_rows=1, is_active=True)
    session.add(mv)
    session.commit()
    session.refresh(mv)
    prediction = Prediction(
        listing_id=listing.id, model_version_id=mv.id,
        fair_price_eur=10_000, interval_low_eur=9_000, interval_high_eur=11_000,
        deal_verdict="cheap", deal_score=0.5,
    )
    session.add(prediction)
    session.commit()

    upsert_listings(session, [{
        "source_id": "price-1", "url": "http://x/1/", "title": "Car",
        "make": "Skoda", "model": "Octavia", "year": 2020, "price_eur": 15_000,
    }])

    session.refresh(prediction)
    assert prediction.deal_verdict == "overpriced"
    assert prediction.deal_score == round((10_000 - 15_000) / 10_000, 4)


def test_backfill_refresh_fixes_stale_cache(session: Session):
    """Legacy rows (verdict cached against an old price) are fixed in place."""
    from app.db.models import ModelVersion, Prediction
    from app.worker import _refresh_cached_verdicts

    listing = Listing(
        source_id="stale-1", url="http://x/s/", title="Car", make="Kia",
        model="Stonic", year=2026, price_eur=22_780,
    )
    session.add(listing)
    session.commit()
    session.refresh(listing)
    mv = ModelVersion(name="m", artifact_path="/x", dataset_rows=1, is_active=True)
    session.add(mv)
    session.commit()
    session.refresh(mv)
    prediction = Prediction(
        listing_id=listing.id, model_version_id=mv.id,
        fair_price_eur=22_665, interval_low_eur=20_000, interval_high_eur=25_000,
        deal_verdict="cheap", deal_score=0.54,  # computed against an old price
    )
    session.add(prediction)
    session.commit()

    assert _refresh_cached_verdicts(session, mv) == 1
    session.refresh(prediction)
    assert prediction.deal_verdict == "fair"
    assert prediction.deal_score == round((22_665 - 22_780) / 22_665, 4)

    # Idempotent: a second sweep has nothing to do.
    assert _refresh_cached_verdicts(session, mv) == 0
