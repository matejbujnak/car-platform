"""Database models."""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    """Current UTC time (stored as a naive datetime, columns are UTC)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Role(str, Enum):
    admin = "admin"
    user = "user"


class User(SQLModel, table=True):
    # "user" is a reserved word in PostgreSQL, hence the explicit table name.
    __tablename__ = "app_user"

    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    password_hash: str
    role: Role = Field(default=Role.user)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=utcnow)


class Listing(SQLModel, table=True):
    """A car listing collected from the source site."""

    id: Optional[int] = Field(default=None, primary_key=True)
    source_id: str = Field(index=True, unique=True)
    url: str
    title: str
    make: str = Field(index=True)
    model: str = Field(index=True)
    year: int = Field(index=True)
    mileage_km: Optional[int] = Field(default=None)
    fuel: Optional[str] = Field(default=None)
    power_kw: Optional[int] = Field(default=None)
    engine_cc: Optional[int] = Field(default=None)
    gearbox: Optional[str] = Field(default=None)
    body: Optional[str] = Field(default=None)
    drive: Optional[str] = Field(default=None)
    seller_type: Optional[str] = Field(default=None)
    price_eur: Optional[float] = Field(default=None, index=True)
    first_seen: datetime = Field(default_factory=utcnow)
    last_seen: datetime = Field(default_factory=utcnow)


class ScrapeRun(SQLModel, table=True):
    """One run of the scraper job (for monitoring in the admin UI)."""

    class Status(str, Enum):
        running = "running"
        success = "success"
        failed = "failed"

    class Kind(str, Enum):
        quick = "quick"  # small manual run
        full = "full"  # full-site crawl (scheduled or manual)

    id: Optional[int] = Field(default=None, primary_key=True)
    kind: Kind = Field(default=Kind.quick)
    started_at: datetime = Field(default_factory=utcnow)
    finished_at: Optional[datetime] = Field(default=None)
    status: Status = Field(default=Status.running)
    cursor: Optional[int] = Field(default=None)  # resume position in a full crawl
    current_segment: Optional[str] = Field(default=None)  # e.g. "skoda 2021"
    listings_new: int = Field(default=0)
    listings_updated: int = Field(default=0)
    error: Optional[str] = Field(default=None)


class ModelVersion(SQLModel, table=True):
    """A trained ML model kept in the registry."""

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    artifact_path: str
    dataset_rows: int = Field(default=0)
    metrics: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    is_active: bool = Field(default=False)
    trained_at: datetime = Field(default_factory=utcnow)
