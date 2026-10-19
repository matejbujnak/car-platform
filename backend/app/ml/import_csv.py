"""Import listings from an export CSV (bootstrap before the scraper fills the DB).

Expected columns:
    make, model, year, mileage_km, fuel, power_kw, engine_cc, gearbox, body,
    drive, seller_type, last_price_eur (or price_eur), url

Usage:
    python -m app.ml.import_csv path/to/cars.csv
"""

import csv
import re
import sys
from pathlib import Path

from sqlmodel import Session

from app.data_quality import classify_offer
from app.db.session import engine
from app.scraping.store import upsert_listings

_ID_RE = re.compile(r"/detail/[^/]+/([^/]+)/?$")


def _source_id(url: str) -> str | None:
    m = _ID_RE.search(url or "")
    return m.group(1) if m else None


def _to_listing(row: dict) -> dict | None:
    url = (row.get("url") or "").strip()
    source_id = _source_id(url)
    if not source_id:
        return None

    make = (row.get("make") or "").strip()
    model = (row.get("model") or "").strip()
    try:
        year = int(float(row.get("year") or 0))
    except ValueError:
        year = 0
    if not year:
        return None

    price = row.get("last_price_eur") or row.get("price_eur")
    title = (row.get("title") or "").strip() or f"{make} {model}, {year}"

    def _num(key: str):
        val = row.get(key)
        if val in (None, ""):
            return None
        try:
            return int(float(val))
        except ValueError:
            return None

    return {
        "source_id": source_id,
        "url": url,
        "title": title,
        "offer_type": classify_offer(title),
        "make": make,
        "model": model,
        "year": year,
        "mileage_km": _num("mileage_km"),
        "fuel": (row.get("fuel") or "").strip() or None,
        "power_kw": _num("power_kw"),
        "engine_cc": _num("engine_cc"),
        "gearbox": (row.get("gearbox") or "").strip() or None,
        "body": (row.get("body") or "").strip() or None,
        "drive": (row.get("drive") or "").strip() or None,
        "seller_type": (row.get("seller_type") or "").strip() or None,
        "price_eur": float(price) if price not in (None, "") else None,
    }


def main(path: str) -> None:
    listings: list[dict] = []
    with open(path, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            item = _to_listing(row)
            if item is not None:
                listings.append(item)

    print(f"Parsed {len(listings)} listings from {Path(path).name}")
    new = updated = 0
    with Session(engine) as session:
        for start in range(0, len(listings), 500):
            n, u = upsert_listings(session, listings[start:start + 500])
            new += n
            updated += u
            print(f"  {start + len(listings[start:start + 500])}/{len(listings)}")
    print(f"Done: {new} new, {updated} updated")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: python -m app.ml.import_csv path/to/cars.csv")
    main(sys.argv[1])
