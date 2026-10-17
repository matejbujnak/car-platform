"""Car Market Analyzer API."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlmodel import Session

from app.db import engine
from app.routers import health
from app.seed import seed_admin


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Database migrations are applied before the server starts (see
    # docker-compose files: "alembic upgrade head && uvicorn ...").
    with Session(engine) as session:
        seed_admin(session)
    yield


app = FastAPI(title="Car Market Analyzer API", lifespan=lifespan)

app.include_router(health.router)
