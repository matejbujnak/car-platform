"""Car Market Analyzer API."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlmodel import Session

from app import config
from app.db.session import engine
from app.ml.predict import active_artifact
from app.core.rate_limit import limiter
from app.api.routers import admin, ask, auth, charts, health, listings, predict, share, stats
from app.db.seed import seed_admin


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    config.check_production_settings()
    # Database migrations are applied before the server starts (see
    # docker-compose files: "alembic upgrade head && uvicorn ...").
    with Session(engine) as session:
        seed_admin(session)
        # Load the active model once so the first request is not slow (and the
        # reverse proxy does not time out into a 502).
        active_artifact(session)
    yield


app = FastAPI(title="Car Market Analyzer API", lifespan=lifespan)

# Rate limiting (see app/rate_limit.py).
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# The browser calls the API from another origin (the frontend dev server or
# the production domain), so CORS must be enabled for those origins only.
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(stats.router)
app.include_router(charts.router)
app.include_router(share.router)
app.include_router(ask.router)
app.include_router(listings.router)
app.include_router(predict.router)
app.include_router(admin.router)
