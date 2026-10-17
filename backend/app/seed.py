"""Seed initial data on startup."""

import logging

from sqlmodel import Session, select

from app import config
from app.models import Role, User
from app.security import hash_password

log = logging.getLogger(__name__)


def seed_admin(session: Session) -> None:
    """Create the admin account from environment variables if missing."""
    if not config.ADMIN_USERNAME or not config.ADMIN_PASSWORD:
        log.warning("ADMIN_USERNAME / ADMIN_PASSWORD not set - admin user not seeded")
        return

    existing = session.exec(
        select(User).where(User.username == config.ADMIN_USERNAME)
    ).first()
    if existing is not None:
        return

    session.add(
        User(
            username=config.ADMIN_USERNAME,
            password_hash=hash_password(config.ADMIN_PASSWORD),
            role=Role.admin,
        )
    )
    session.commit()
    log.info("Seeded admin user '%s'", config.ADMIN_USERNAME)
