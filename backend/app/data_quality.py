"""Data-quality helpers shared by the scraper, importer and training.

Some listings are not sales at all - rental and subscription offers show a
monthly/daily rate in the price field ("Porsche 911 na prenajom 5,890 EUR").
They must not train the price model (a 911 is not a 5,890 EUR car) and get no
deal verdict, so they are classified at ingest time.
"""

import re

OFFER_SALE = "sale"
OFFER_RENT = "rent"

# Strong rental/subscription markers. Deliberately does NOT match weak phrases
# like "leasing mozny" that often appear in ordinary sale ads.
_RENT_RE = re.compile(
    r"(na\s+pren[áa]j|pren[áa]j\w*|podn[áa]j|operat[íi]vn|pau[sš][áa]l|(eur|€)\s*/\s*de[nň])",
    re.IGNORECASE,
)


def classify_offer(title: str | None) -> str:
    """'rent' for rental/subscription offers, 'sale' for everything else."""
    if title and _RENT_RE.search(title):
        return OFFER_RENT
    return OFFER_SALE
