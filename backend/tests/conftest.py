"""Shared test fixtures: an isolated SQLite database and an API client.

Environment variables must be set BEFORE the app modules are imported -
config.py reads them at import time.
"""

import os
import tempfile

_TMP_DIR = tempfile.mkdtemp(prefix="car-platform-tests-")
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP_DIR}/test.db"
os.environ["APP_ENV"] = "development"
os.environ["ADMIN_USERNAME"] = "admin"
os.environ["ADMIN_PASSWORD"] = "test-password"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import Session, SQLModel  # noqa: E402

from app.db.models import Listing  # noqa: E402,F401  (registers tables)
from app.db.seed import seed_admin  # noqa: E402
from app.db.session import engine, get_session  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def session():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        yield s
    SQLModel.metadata.drop_all(engine)


@pytest.fixture()
def client(session: Session):
    """API client bound to the test database."""

    def _override():
        yield session

    app.dependency_overrides[get_session] = _override
    seed_admin(session)
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def sample_listing(session: Session) -> Listing:
    row = Listing(
        source_id="test-1",
        url="https://example.com/detail/test/1/",
        title="Skoda Octavia Combi 2.0 TDi",
        make="Skoda",
        model="Octavia",
        year=2020,
        mileage_km=120_000,
        fuel="Diesel",
        power_kw=110,
        engine_cc=2000,
        gearbox="6-st. manualna",
        body="Combi",
        drive="Predny",
        seller_type="dealer",
        price_eur=16_000,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row
