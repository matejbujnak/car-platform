"""Database helpers for scraped data."""

from sqlmodel import Session, select

from app.db.models import Listing, PriceHistory, utcnow


def upsert_listings(session: Session, items: list[dict]) -> tuple[int, int]:
    """Insert new listings / refresh existing ones. Returns (new, updated).

    A listing seen again is always marked active - a wrongly marked sold car
    comes back to life on the next crawl. Price changes are recorded in the
    price history so the UI can show how the price develops over time.
    """
    new = updated = 0
    for item in items:
        listing = session.exec(
            select(Listing).where(Listing.source_id == item["source_id"])
        ).first()
        if listing is None:
            listing = Listing(**item)
            session.add(listing)
            session.flush()  # assign listing.id for the history row
            new += 1
            if item.get("price_eur") is not None:
                session.add(
                    PriceHistory(listing_id=listing.id, price_eur=item["price_eur"])
                )
        else:
            price_changed = item.get("price_eur") not in (None, listing.price_eur)
            for key, value in item.items():
                setattr(listing, key, value)
            listing.status = "active"
            listing.last_seen = utcnow()
            session.add(listing)
            updated += 1
            if price_changed:
                session.add(
                    PriceHistory(
                        listing_id=listing.id,
                        price_eur=item["price_eur"],
                    )
                )
    session.commit()
    return new, updated
