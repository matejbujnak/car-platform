"""Database engine and session management."""

from collections.abc import Iterator

from sqlmodel import Session, create_engine

from app.config import DATABASE_URL

engine = create_engine(DATABASE_URL, pool_pre_ping=True)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
