"""Application settings loaded from environment variables."""

import os

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://car_platform:car_platform@postgres_db:5432/car_platform_dev",
)
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
