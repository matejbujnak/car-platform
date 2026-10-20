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