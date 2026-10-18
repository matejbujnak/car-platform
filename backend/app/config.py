"""Application settings loaded from environment variables."""

import logging
import os
import secrets

log = logging.getLogger(__name__)

# "development" or "production". Production refuses to start without secrets.
APP_ENV = os.getenv("APP_ENV", "development")


def _normalize_db_url(url: str) -> str:
    """Make sure the URL points to the psycopg3 driver installed in requirements."""
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


DATABASE_URL = _normalize_db_url(
    os.getenv(
        "DATABASE_URL",
        "postgresql://car_platform:car_platform@postgres_db:5432/car_platform_dev",
    )
)
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

# Where trained model artifacts are stored (shared volume in deployment).
MODEL_DIR = os.getenv("MODEL_DIR", "/models")

# Admin account seeded on first start. When unset, no admin is created.
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")


def _secret_key() -> str:
    key = os.getenv("SECRET_KEY", "")
    if key:
        return key
    if APP_ENV == "production":
        raise RuntimeError("SECRET_KEY must be set when APP_ENV=production")
    log.warning("SECRET_KEY is not set - using a temporary development key")
    return secrets.token_hex(32)


SECRET_KEY = _secret_key()
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

# Scraper politeness (the source site must not be hammered).
# With these delays the crawler does ~350-450 requests/hour - a full catalogue
# crawl then takes roughly a working day instead of two.
SCRAPE_MAX_PER_HOUR = int(os.getenv("SCRAPE_MAX_PER_HOUR", "500"))
SCRAPE_QUICK_MAX_PAGES = int(os.getenv("SCRAPE_QUICK_MAX_PAGES", "5"))
SCRAPE_MIN_DELAY_SECONDS = float(os.getenv("SCRAPE_MIN_DELAY_SECONDS", "5"))
SCRAPE_MAX_DELAY_SECONDS = float(os.getenv("SCRAPE_MAX_DELAY_SECONDS", "9"))
# Only scrape during this hour window (e.g. 1-5 = night hours).
# Start == end disables the window.
SCRAPE_WINDOW_START_HOUR = int(os.getenv("SCRAPE_WINDOW_START_HOUR", "0"))
SCRAPE_WINDOW_END_HOUR = int(os.getenv("SCRAPE_WINDOW_END_HOUR", "0"))

# Daily scheduled full-site crawl.
SCRAPE_SCHEDULE_HOUR = int(os.getenv("SCRAPE_SCHEDULE_HOUR", "22"))
# Timezone for SCRAPE_SCHEDULE_HOUR and the scrape window hours.
SCHEDULE_TZ = os.getenv("SCHEDULE_TZ", "UTC")


def check_production_settings() -> None:
    """Refuse to run in production when required secrets are missing."""
    if APP_ENV != "production":
        return
    missing = [
        name
        for name, value in (("SECRET_KEY", os.getenv("SECRET_KEY", "")), ("ADMIN_PASSWORD", ADMIN_PASSWORD))
        if not value
    ]
    if missing:
        raise RuntimeError(
            f"Missing required settings for production: {', '.join(missing)}"
        )
