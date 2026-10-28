"""Database helpers for scraped data."""

from sqlmodel import Session, select

from app.db.models import Listing, Prediction, PriceHistory, utcnow
from app.ml.features import plausible_price
from app.ml.predict import deal_verdict


def _refresh_prediction_verdicts(session: Session, listing: Listing) -> None:
    """Keep cached deal verdicts in sync with the current asking price.

    Fair price and interval do not depend on the asking price, so a price
    change only needs a cheap recompute of the verdict - no model call.
    """
    predictions = session.exec(
        select(Prediction).where(Prediction.listing_id == listing.id)
    ).all()
    for prediction in predictions:
        verdict = score = None
        if listing.offer_type == "sale" and plausible_price(listing.price_eur):
            verdict, score = deal_verdict(
                listing.price_eur,
                {
                    "fair_price_eur": prediction.fair_price_eur,
                    "interval_low_eur": prediction.interval_low_eur,
                    "interval_high_eur": prediction.interval_high_eur,
                },
            )
        prediction.deal_verdict = verdict
        prediction.deal_score = score
        session.add(prediction)


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
            offer_changed = item.get("offer_type") not in (None, listing.offer_type)
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
            if price_changed or offer_changed:
                _refresh_prediction_verdicts(session, listing)
    session.commit()
    return new, updated
