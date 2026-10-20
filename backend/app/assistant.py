"""Market assistant: natural-language questions over the listings.

Pipeline (the honest kind of "RAG" for structured data):

    question (any language)
      -> intent parser extracts structured filters (numbers, keywords)
      -> a precise SQL query runs against the database (source of truth)
      -> the matches + market summary become the context for a local LLM
      -> the LLM writes the answer in English, grounded in that data

Embeddings are deliberately not used for retrieval: exact numeric filters
("under 50k", "from 2019") are what matters here, and SQL is exact.

The LLM (Ollama) is optional - when it is unavailable the caller still gets
the matched listings and a factual fallback summary.
"""

import json
import re
from typing import Optional

import httpx
from sqlmodel import Session, and_, func, or_, select

from app import config
from app.db.models import Listing, Prediction
from app.ml.predict import active_model

SYSTEM_PROMPT = (
    "You are a car market analyst for a used-car marketplace. "
    "Answer IN ENGLISH regardless of the language of the question. "
    "Use ONLY the data provided - never invent cars, prices or statistics. "
    "Be concise (max ~150 words), mention concrete cars with their prices "
    "in EUR, and say honestly when the data does not contain an answer."
)

# --- intent parsing ---------------------------------------------------------

# The LLM understands phrasing and synonyms; the rule-based parser below is
# the offline fallback when the model is unavailable.

_PROMPT_TEMPLATE = """Extract car search filters from the text below and answer with ONLY a JSON object.

Include ONLY attributes that are explicitly mentioned - never invent brands,
models or values that the text does not contain.

Allowed keys (omit keys that are not mentioned):
- make: array of brand names (e.g. ["Škoda"])
- model: array of model names (e.g. ["Octavia"])
- fuel: array with values from: Benzín, Diesel, Elektromotor, Hybrid (Elektrina - benzín), Hybrid (Elektrina - diesel), Plug-in hybrid, CNG + benzín, LPG + benzín
- gearbox: "manual" or "automatic"
- body: array with values from: Sedan, Combi, Hatchback, SUV, SUV / Off-road, Coupé, Cabrio, Liftback, Mpv/Van, Limuzína, Iné
- drive: "front", "rear", "4x4" or "other"
- price_min, price_max, year_min, year_max, mileage_max, power_min, power_max: numbers
- verdict: "cheap", "fair" or "overpriced"
- sort: one of newest, deal_best, deal_worst, price_low, price_high, year_new, year_old, mileage_low, mileage_high, power_high, fuel_az

Examples:
Text: "rodinny kombik do 15 000 eur, naftovy"
JSON: {"body": ["Combi"], "fuel": ["Diesel"], "price_max": 15000}

Text: "something sporty with at least 200 kW, automatic, not older than 2018"
JSON: {"power_min": 200, "gearbox": "automatic", "year_min": 2018}

Text: \"\"\"%s\"\"\"
JSON:"""

_ENUMS = {
    "gearbox": {"manual", "automatic"},
    "drive": {"front", "rear", "4x4", "other"},
    "verdict": {"cheap", "fair", "overpriced"},
    "sort": {
        "newest", "deal_best", "deal_worst", "price_low", "price_high",
        "year_new", "year_old", "mileage_low", "mileage_high", "power_high",
        "fuel_az",
    },
}
_NUMBER_KEYS = {
    "price_min", "price_max", "year_min", "year_max",
    "mileage_max", "power_min", "power_max",
}
_LIST_KEYS = {"make", "model", "fuel", "body"}


def _clean_filters(raw: dict) -> dict:
    """Keep only known keys with sane types so the UI can use them.

    This is pure schema validation (numbers are numbers, enums are valid
    values) - the meaning of the question is decided by the LLM alone.
    """
    filters: dict = {}
    for key, value in raw.items():
        if key in _NUMBER_KEYS:
            try:
                number = int(float(value))
            except (TypeError, ValueError):
                continue
            if 0 < number < 10**7:
                filters[key] = number
        elif key in _ENUMS:
            lowered = str(value).lower()
            if lowered in _ENUMS[key]:
                filters[key] = lowered
        elif key in _LIST_KEYS and isinstance(value, list):
            items = [str(v).strip() for v in value if str(v).strip()]
            if items:
                filters[key] = ",".join(items[:5])
    return filters


def parse_with_llm(question: str) -> dict | None:
    """Ask the local LLM for filters as JSON. Returns None when unavailable."""
    try:
        resp = httpx.post(
            f"{config.OLLAMA_URL}/api/chat",
            json={
                "model": config.OLLAMA_MODEL,
                "stream": False,
                "keep_alive": "2h",
                "format": "json",  # force a JSON object from the model
                "options": {"temperature": 0.0, "num_predict": 200},
                "messages": [
                    {"role": "system", "content": "You convert search requests into JSON filters."},
                    {"role": "user", "content": _PROMPT_TEMPLATE % question},
                ],
            },
            timeout=120.0,
        )
        resp.raise_for_status()
        content = resp.json()["message"]["content"]
        raw = json.loads(content) if isinstance(content, str) else content
        if not isinstance(raw, dict):
            return None
        return _clean_filters(raw)
    except Exception:  # noqa: BLE001 - fall back to the rule-based parser
        return None


def extract_filters(question: str) -> tuple[dict, str]:
    """Natural language -> filters. Returns (filters, source).

    An LLM experiment: the model alone decides what the question means (its
    guesses included). The rule-based parser is only a fallback for when the
    model is not available.
    """
    filters = parse_with_llm(question)
    if filters is not None:
        return filters, "llm"

    raw = parse_question(question)
    rules: dict = {}
    for key, value in raw.items():
        if key == "bodies":
            rules["body"] = ",".join(value)
        elif key == "fuels":
            rules["fuel"] = ",".join(value)
        elif key != "limit":
            rules[key] = value
    return rules, "rules"


# --- rule-based fallback ----------------------------------------------------

# A number with its unit; the lookahead prevents "km"/"kw" being read as "k".
_NUM = r"(\d[\d\s.,]*)\s*(k|tis\.?|tisíc|tisic)?(?![a-z])"
_MONEY = r"(\d[\d\s.,]*)\s*(k|tis\.?|tisíc|tisic|eur|€)(?![a-z])"
_KM = r"(\d[\d\s.,]*)\s*(?:(k|tis\.?|tisíc|tisic)(?![a-z]))?\s*(?:km)"
_KW = r"(\d[\d\s.,]*)\s*kw(?![a-z])"
_YEAR = r"((?:19|20)\d{2})(?!\d)"

FUEL_KEYWORDS = {
    "Benzín": ["benz", "petrol", "gasoline"],
    "Diesel": ["diesel", "naft"],
    "Elektromotor": ["elektro", "electric", " ev "],
    "Hybrid (Elektrina - benzín)": ["hybrid"],
    "Hybrid (Elektrina - diesel)": ["hybrid"],
    "Plug-in hybrid": ["plug-in", "plugin", "hybrid"],
}

BODY_KEYWORDS = {
    "Combi": ["kombi", "combi", "estate", "wagon"],
    "SUV": ["suv", "off-road", "offroad"],
    "Sedan": ["sedan", "limuz"],
    "Hatchback": ["hatchback"],
    "Coupé": ["coupe", "kupé"],
    "Cabrio": ["cabrio", "roadster", "convertible"],
}


def _to_number(raw: str, suffix: Optional[str]) -> int:
    value = float(re.sub(r"[^\d.]", "", raw) or 0)
    if suffix and suffix.lower().startswith(("k", "tis")):
        value *= 1000
    return int(value)


def _normalize_year_phrases(text: str) -> str:
    """Turn year phrases into simple "od"/"do" so direction cannot be flipped:
    "nie je staršie ako 2020" == "od 2020", "staršie ako 2020" == "do 2020"."""

    def _year_phrase(match: "re.Match[str]") -> str:
        phrase = match.group(0).lower()
        prefix = text[max(0, match.start() - 25) : match.start()]
        negative = any(word in prefix for word in ("nie", "not", "nech"))
        older = "star" in phrase or "older" in phrase
        return "od" if older == negative else "do"

    return re.sub(
        r"star[sš]ie\s+ako|older\s+than|nov[sš]ie\s+ako|newer\s+than",
        _year_phrase,
        text,
    )


def parse_question(question: str) -> dict:
    """Extract structured search intent from a natural-language question.

    Fragments are matched and removed in order (year -> km -> kW -> price) so
    that "do 2020" becomes a year and not a price, and "do 100 000 km" is not
    read as thousands of euros.
    """
    working = _normalize_year_phrases(f" {question} ".lower())
    filters: dict = {}

    # Year: "od 2019", "do roku 2022"
    year_from = re.search(rf"(?:od\s*roku|od|od\s*ročníka|od\s*rocnika|since|from)\s*{_YEAR}", working)
    if year_from:
        filters["year_min"] = int(year_from.group(1))
        working = working.replace(year_from.group(0), " ", 1)
    year_to = re.search(rf"(?:do\s*roka|do|do\s*ročníka|do\s*rocnika|until)\s*{_YEAR}", working)
    if year_to:
        filters["year_max"] = int(year_to.group(1))
        working = working.replace(year_to.group(0), " ", 1)

    # Mileage: "do 100 000 km", "do 100k km"
    mileage = re.search(_KM, working)
    if mileage:
        filters["mileage_max"] = _to_number(mileage.group(1), mileage.group(2))
        working = working.replace(mileage.group(0), " ", 1)

    # Power: "aspoň 150 kW", "nad 100 kW", "do 200 kW"
    power_min = re.search(rf"(?:aspoň|aspon|nad|od|at least|from|min)\s*{_KW}", working)
    if power_min:
        filters["power_min"] = _to_number(power_min.group(1), None)
        working = working.replace(power_min.group(0), " ", 1)
    power_max = re.search(rf"(?:do|max|under|below)\s*{_KW}", working)
    if power_max:
        filters["power_max"] = _to_number(power_max.group(1), None)
        working = working.replace(power_max.group(0), " ", 1)

    # Price: "do 50k", "do 20 000 €", bare "do 50000"
    price_max = re.search(rf"(?:do\s*ceny|do|max|under|below)\s*{_MONEY}", working)
    if price_max:
        value = _to_number(price_max.group(1), price_max.group(2))
        if value >= 300:
            filters["price_max"] = value
            working = working.replace(price_max.group(0), " ", 1)
    price_min = re.search(rf"(?:od\s*ceny|od|nad|above|from|aspoň|aspon|min)\s*{_MONEY}", working)
    if price_min:
        value = _to_number(price_min.group(1), price_min.group(2))
        if value >= 300 and value != filters.get("price_max"):
            filters["price_min"] = value

    # Fuel / body / gearbox / drive keywords.
    for fuel, words in FUEL_KEYWORDS.items():
        if any(word in working for word in words):
            filters.setdefault("fuels", []).append(fuel)
    for body, words in BODY_KEYWORDS.items():
        if any(word in working for word in words):
            filters.setdefault("bodies", []).append(body)
    if "manuál" in working or "manual" in working:
        filters["gearbox"] = "manual"
    elif "automat" in working:
        filters["gearbox"] = "automatic"
    if "4x4" in working or "quattro" in working or "štvorkolk" in working or "stvorkolk" in working:
        filters["drive"] = "4x4"
    elif "predn" in working or "front" in working:
        filters["drive"] = "front"
    elif "zadn" in working or "rear" in working:
        filters["drive"] = "rear"

    # What is the user looking for?
    if any(w in working for w in ("deal", "oplat", "pod cenu", "undervalued")):
        filters["sort"] = "deal_best"
    elif any(w in working for w in ("najdrah", "most expensive", "premium")):
        filters["sort"] = "price_high"
    elif any(w in working for w in ("najlacn", "cheapest", "lacn", "low price")):
        filters["sort"] = "price_low"

    filters["limit"] = 8
    return filters


# --- retrieval --------------------------------------------------------------

def search_listings(session: Session, filters: dict) -> tuple[list[dict], dict]:
    """Run the parsed intent as a real query; returns matches + a summary."""
    conditions = [Listing.status == "active", Listing.offer_type == "sale"]
    if filters.get("price_min") is not None:
        conditions.append(Listing.price_eur >= filters["price_min"])
    if filters.get("price_max") is not None:
        conditions.append(Listing.price_eur <= filters["price_max"])
    if filters.get("year_min") is not None:
        conditions.append(Listing.year >= filters["year_min"])
    if filters.get("year_max") is not None:
        conditions.append(Listing.year <= filters["year_max"])
    if filters.get("mileage_max") is not None:
        conditions.append(Listing.mileage_km <= filters["mileage_max"])
    if filters.get("power_min") is not None:
        conditions.append(Listing.power_kw >= filters["power_min"])
    if filters.get("power_max") is not None:
        conditions.append(Listing.power_kw <= filters["power_max"])
    if filters.get("fuels"):
        conditions.append(or_(*[Listing.fuel.ilike(f"%{f}%") for f in filters["fuels"]]))
    if filters.get("bodies"):
        conditions.append(or_(*[Listing.body.ilike(f"%{b}%") for b in filters["bodies"]]))
    if filters.get("gearbox") == "manual":
        conditions.append(Listing.gearbox.ilike("%manu%"))
    elif filters.get("gearbox") == "automatic":
        conditions.append(Listing.gearbox.ilike("%auto%"))
    if filters.get("drive") == "4x4":
        conditions.append(Listing.drive.ilike("%4x4%"))
    elif filters.get("drive") == "front":
        conditions.append(or_(Listing.drive.ilike("%predn%"), Listing.drive.ilike("%front%")))
    elif filters.get("drive") == "rear":
        conditions.append(or_(Listing.drive.ilike("%zadn%"), Listing.drive.ilike("%rear%")))

    matches_total = session.exec(
        select(func.count()).select_from(Listing).where(*conditions)
    ).one()

    sort = filters.get("sort", "newest")
    query = select(Listing).where(*conditions)
    if sort == "deal_best":
        # Best deals first - via the prediction cache of the active model.
        mv = active_model(session)
        if mv is not None:
            query = query.join(
                Prediction,
                and_(
                    Prediction.listing_id == Listing.id,
                    Prediction.model_version_id == mv.id,
                ),
            ).order_by(Prediction.deal_score.desc().nulls_last())
        else:
            query = query.order_by(Listing.price_eur.asc().nulls_last())
    elif sort == "price_low":
        query = query.order_by(Listing.price_eur.asc().nulls_last())
    elif sort == "price_high":
        query = query.order_by(Listing.price_eur.desc().nulls_last())
    else:
        query = query.order_by(Listing.id.desc())

    rows = session.exec(query.limit(filters.get("limit", 8))).all()

    matches = [
        {
            "id": row.id,
            "title": row.title,
            "year": row.year,
            "mileage_km": row.mileage_km,
            "power_kw": row.power_kw,
            "fuel": row.fuel,
            "gearbox": row.gearbox,
            "price_eur": row.price_eur,
            "url": row.url,
        }
        for row in rows
    ]
    summary = {"matches_total": int(matches_total)}
    return matches, summary


def warm_up() -> None:
    """Load the LLM in the background at startup (cold start takes minutes)."""

    def _ping() -> None:
        try:
            httpx.post(
                f"{config.OLLAMA_URL}/api/chat",
                json={
                    "model": config.OLLAMA_MODEL,
                    "stream": False,
                    "keep_alive": "2h",
                    "options": {"num_predict": 5},
                    "messages": [{"role": "user", "content": "hi"}],
                },
                timeout=300.0,
            )
        except Exception:  # noqa: BLE001 - warm-up is best-effort
            pass

    import threading

    threading.Thread(target=_ping, daemon=True).start()


# --- generation -------------------------------------------------------------

def generate_answer(question: str, filters: dict, matches: list[dict], summary: dict) -> tuple[str, bool]:
    """Ask the local LLM for a grounded answer. Returns (answer, used_llm)."""
    context = {
        "question": question,
        "applied_filters": {k: v for k, v in filters.items() if v},
        "total_matches": summary.get("matches_total", len(matches)),
        "offers": matches,
    }
    try:
        resp = httpx.post(
            f"{config.OLLAMA_URL}/api/chat",
            json={
                "model": config.OLLAMA_MODEL,
                "stream": False,
                # Keep the model in memory between questions (a cold start on
                # a small board takes minutes) and bound the answer length so
                # latency stays predictable.
                "keep_alive": "2h",
                "options": {"temperature": 0.2, "num_predict": 220},
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": (
                            "Market data:\n"
                            f"{context}\n\n"
                            f"Question: {question}\n"
                            "Write the answer in English."
                        ),
                    },
                ],
            },
            timeout=300.0,
        )
        resp.raise_for_status()
        answer = resp.json()["message"]["content"].strip()
        return answer, True
    except Exception:  # noqa: BLE001 - the assistant must work without the LLM
        total = summary.get("matches_total", len(matches))
        if not matches:
            return (
                f"I found {total} matching offers, but none fit on this page. "
                "Try widening the filters.",
                False,
            )
        cheapest = min(matches, key=lambda m: m.get("price_eur") or 1e18)
        return (
            f"I found {total} matching offers. The cheapest option here is "
            f"'{cheapest['title']}' at {cheapest['price_eur']:,.0f} EUR. "
            "(AI commentary is unavailable right now - showing raw results.)",
            False,
        )
