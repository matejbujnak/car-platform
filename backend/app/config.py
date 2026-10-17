"""Application settings loaded from environment variables."""

import os


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

# Admin account seeded on first start. When unset, no admin is created.
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
