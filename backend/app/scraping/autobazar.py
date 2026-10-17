"""Polite scraper for autobazar.eu.

Fetches result pages and parses the embedded __NEXT_DATA__ JSON. Does not save
anything - callers decide what to do with the parsed dicts.

Politeness rules:
- checks robots.txt before crawling and respects it
- random delay between requests, a longer break every so often
- caps requests per hour via a shared counter
- only crawls inside the configured time window (when enabled)

The site caps results at 50 pages x 20 = 1000 listings per filter, so a full
scrape must be split by filters (year, price, ...). Here we fetch up to the cap
for whatever filter is given.
"""

from __future__ import annotations

import json
import logging
import random
import re
import time
from datetime import datetime, timezone
from typing import Iterator, Optional
from urllib.robotparser import RobotFileParser

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from app import config
from app.scraping import jobs

log = logging.getLogger(__name__)

BASE_URL = "https://www.autobazar.eu"
LISTINGS_PATH = "/vysledky/osobne-vozidla/"
USER_AGENT = "car-market-analyzer/1.0 (open-source research project; respects robots.txt)"
MAX_PAGE = 50
PER_PAGE = 20

# Extra-long break every N requests, so the crawl looks human-ish.
LONG_BREAK_EVERY = 25
LONG_BREAK_MIN = 90.0
LONG_BREAK_MAX = 150.0

_request_count = 0

_SELLER_TYPE = {30726: "dealer", 30727: "private"}

# filter key -> query parameter on the site
_FILTER_PARAMS = {
    "year_from": "yearFrom",
    "year_to": "yearTo",
    "mileage_from": "mileageFrom",
    "mileage_to": "mileageTo",
    "price_from": "priceFrom",
    "price_to": "priceTo",
}


class ScrapeBlocked(Exception):
    """robots.txt does not allow crawling this URL."""


class HourlyLimitReached(Exception):
    """The request budget for this hour is used up."""


# --- politeness -------------------------------------------------------------

class _AllowAll:
    """Fallback used when robots.txt cannot be fetched."""

    @staticmethod
    def can_fetch(useragent: str, url: str) -> bool:
        return True


_robots: Optional[object] = None


def _robots_allowed(session: requests.Session, url: str) -> bool:
    """Check robots.txt rules. Fetched once per process with our own polite
    User-Agent - the default urllib agent is blocked by the site, and a failed
    read() would make RobotFileParser deny everything."""
    global _robots
    if _robots is None:
        try:
            resp = session.get(f"{BASE_URL}/robots.txt", timeout=25)
            resp.raise_for_status()
            rp = RobotFileParser()
            rp.parse(resp.text.splitlines())
            _robots = rp
        except Exception:  # noqa: BLE001 - unreachable robots.txt must not kill the run
            log.warning("robots.txt not reachable - assuming crawling is allowed")
            _robots = _AllowAll()
    return _robots.can_fetch(USER_AGENT, url)


def within_scrape_window() -> bool:
    """True when scraping is allowed at the current hour (UTC)."""
    start, end = config.SCRAPE_WINDOW_START_HOUR, config.SCRAPE_WINDOW_END_HOUR
    if start == end:
        return True  # window disabled
    hour = datetime.now(timezone.utc).hour
    if start < end:
        return start <= hour < end
    return hour >= start or hour < end  # window wraps around midnight


def _polite_sleep() -> None:
    global _request_count
    _request_count += 1
    if _request_count % LONG_BREAK_EVERY == 0:
        time.sleep(random.uniform(LONG_BREAK_MIN, LONG_BREAK_MAX))
    else:
        time.sleep(
            random.uniform(config.SCRAPE_MIN_DELAY_SECONDS, config.SCRAPE_MAX_DELAY_SECONDS)
        )


def _get(session: requests.Session, url: str) -> str:
    if not _robots_allowed(session, url):
        raise ScrapeBlocked(f"robots.txt does not allow {url}")
    count = jobs.incr_window_counter("scrape-requests", 3600)
    if count > config.SCRAPE_MAX_PER_HOUR:
        raise HourlyLimitReached(
            f"request budget used up ({config.SCRAPE_MAX_PER_HOUR} requests/hour)"
        )
    resp = session.get(url, timeout=25)
    resp.raise_for_status()
    _polite_sleep()  # wait after every request
    return resp.text


# --- parsing ----------------------------------------------------------------


def _extract_next_data(html: str) -> Optional[dict]:
    m = re.search(
        r'<script id="__NEXT_DATA__" type="application/json">(.+?)</script>',
        html,
        re.DOTALL,
    )
    if not m:
        return None
    return json.loads(m.group(1))


def _record_to_dict(rec: dict) -> Optional[dict]:
    listing_id = rec.get("id")
    if not listing_id:
        return None

    try:
        year = int(rec.get("yearValue") or 0)
    except (TypeError, ValueError):
        year = 0
    if not year:
        return None

    user = rec.get("user") or {}
    subject_type = user.get("subjectType") or rec.get("userSubjectType")

    # finalPrice/priceCurrent is the real price in EUR already converted by the
    # site; the raw `price` field can be a leasing/on-request placeholder.
    price = rec.get("finalPrice") or rec.get("priceCurrent")

    return {
        "source_id": str(listing_id),
        "url": f"{BASE_URL}/detail/{rec.get('sefName') or ''}/{listing_id}/",
        "title": rec.get("title") or "",
        "make": rec.get("brandValue") or "",
        "model": rec.get("carModelValue") or "",
        "year": year,
        "mileage_km": rec.get("mileage"),
        "fuel": rec.get("fuelValue"),
        "power_kw": rec.get("enginePower"),
        "engine_cc": rec.get("engineCapacity"),
        "gearbox": rec.get("gearboxValue"),
        "body": rec.get("bodyworkValue"),
        "drive": rec.get("driveValue"),
        "seller_type": _SELLER_TYPE.get(subject_type),
        "price_eur": (round(price / 10) * 10) if price else None,
    }


# --- fetching ---------------------------------------------------------------


def _build_url(page: int = 1, filters: Optional[dict] = None) -> str:
    filters = filters or {}
    make = filters.get("make")
    path = f"{LISTINGS_PATH}{make}/" if make else LISTINGS_PATH

    params: list[str] = []
    for key, qs in _FILTER_PARAMS.items():
        val = filters.get(key)
        if val is not None:
            params.append(f"{qs}={val}")
    if page > 1:
        params.append(f"page={page}")

    query = "&".join(params)
    return f"{BASE_URL}{path}?{query}" if query else f"{BASE_URL}{path}"


def _make_session() -> requests.Session:
    session = requests.Session()
    # Back off (respecting Retry-After) on rate-limit / server errors.
    retry = Retry(
        total=5,
        backoff_factor=5,
        status_forcelist=[429, 500, 502, 503, 504],
        respect_retry_after_header=True,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update(
        {
            "User-Agent": USER_AGENT,
            "Accept-Language": "sk-SK,sk;q=0.9,en;q=0.8",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }
    )
    return session


def _fetch_page(session: requests.Session, page: int, filters: Optional[dict]) -> tuple[list[dict], int]:
    data = _extract_next_data(_get(session, _build_url(page, filters)))
    if not data:
        return [], 0
    try:
        sr = data["props"]["pageProps"]["searchRecords"]
        records = sr.get("data") or []
        total = sr.get("total") or 0
    except (KeyError, TypeError):
        return [], 0
    parsed = [d for d in (_record_to_dict(r) for r in records) if d is not None]
    return parsed, total


def iter_pages(max_pages: int, filters: Optional[dict] = None) -> Iterator[list[dict]]:
    """Yield one batch of parsed listings per page.

    When a filter has few/no matches, the site pads the page with promoted cars
    from other makes/years. `total` is the real match count, so we take only the
    first `total` results and stop - otherwise those padded cars get scraped
    repeatedly and pollute the data.
    """
    session = _make_session()
    yielded = 0
    for page in range(1, min(max_pages, MAX_PAGE) + 1):
        listings, total = _fetch_page(session, page, filters)
        if not listings or total <= 0:
            return

        batch: list[dict] = []
        for item in listings:
            if yielded >= total:
                break
            batch.append(item)
            yielded += 1
        if batch:
            yield batch

        if yielded >= total or page * PER_PAGE >= total:
            return
