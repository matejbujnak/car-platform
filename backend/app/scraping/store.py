"""Database helpers for scraped data."""

from sqlmodel import Session, select

from app.db.models import Listing, utcnow


def upsert_listings(session: Session, items: list[dict]) -> tuple[int, int]:
    """Insert new listings / refresh existing ones. Returns (new, updated).

    A listing seen again is always marked active - a wrongly marked sold car
    comes back to life on the next crawl.
    """
    new = updated = 0
    for item in items:
        listing = session.exec(
            select(Listing).where(Listing.source_id == item["source_id"])
        ).first()
        if listing is None:
            session.add(Listing(**item))
            new += 1
        else:
            for key, value in item.items():
                setattr(listing, key, value)
            listing.status = "active"
            listing.last_seen = utcnow()
            session.add(listing)
            updated += 1
    session.commit()
    return new, updated
