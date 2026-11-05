import uuid
from collections.abc import Iterator

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.security import decode_access_token
from app.db.session import SessionLocal
from app.models import User
from app.repositories import user_repository


def get_db() -> Iterator[Session]:
    with SessionLocal() as db:
        yield db


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    # Kong has already checked the signature. This service checks again, and checks expiry,
    # so a request that skips Kong is still rejected.
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise AppError(401, "AUTH_INVALID", "Please sign in")
    claims = decode_access_token(token)
    try:
        user_id = uuid.UUID(claims["sub"])
    except ValueError:
        raise AppError(401, "AUTH_INVALID", "Please sign in") from None
    user = user_repository.get_by_id(db, user_id)
    if user is None or not user.can_sign_in:
        raise AppError(401, "AUTH_INVALID", "Please sign in")
    return user
