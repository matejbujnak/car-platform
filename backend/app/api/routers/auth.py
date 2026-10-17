"""Login and current-user endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select

from app.core.auth import create_access_token, get_current_user
from app.db.session import get_session
from app.db.models import User
from app.core.rate_limit import limiter
from app.core.security import verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
@limiter.limit("5/minute")
def login(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(get_session),
) -> dict:
    user = session.exec(select(User).where(User.username == form.username)).first()
    if (
        user is None
        or not user.is_active
        or not verify_password(form.password, user.password_hash)
    ):
        # Same error for unknown user and wrong password (do not leak which).
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return {"access_token": create_access_token(user), "token_type": "bearer"}


@router.get("/me")
def me(user: User = Depends(get_current_user)) -> dict:
    return {"id": user.id, "username": user.username, "role": user.role.value}
