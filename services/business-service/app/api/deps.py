import uuid
from collections.abc import Callable, Iterator

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.security import decode_access_token
from app.db.session import SessionLocal
from app.models import Membership, User
from app.repositories import membership_repository


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
    user = db.get(User, user_id)
    if user is None or not user.is_active or not any(m.is_active for m in user.memberships):
        raise AppError(401, "AUTH_INVALID", "Please sign in")
    return user


def get_membership(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Membership:
    """The person's place in the company named by X-Organization-Id (ADR-010)."""
    try:
        organization_id = uuid.UUID(request.headers.get("x-organization-id", ""))
    except ValueError:
        raise AppError(403, "FORBIDDEN", "Choose a workspace") from None
    membership = membership_repository.get(db, organization_id, user.id)
    if membership is None or not membership.is_active:
        raise AppError(403, "FORBIDDEN", "You are not a member of this workspace")
    return membership


def require_permission(code: str) -> Callable[..., Membership]:
    def check(membership: Membership = Depends(get_membership)) -> Membership:
        # Loaded from the database on each request, so a role change applies at once.
        if code not in {p.code for p in membership.role.permissions}:
            raise AppError(403, "FORBIDDEN", "You do not have permission to do this")
        return membership

    return check
