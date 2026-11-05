import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.rate_limit import login_throttle
from app.core.security import (
    DUMMY_PASSWORD_HASH,
    create_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    verify_password,
)
from app.models import Membership, Organization, RefreshToken, User
from app.repositories import token_repository, user_repository
from app.schemas.auth import MembershipOut, MeOut, OrganizationOut, SignupIn, SignupOut, TokenOut, UserSummary


def _issue_tokens(db: Session, user: User, family_id: uuid.UUID | None = None) -> TokenOut:
    settings = get_settings()
    refresh_token = new_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(refresh_token),
            family_id=family_id or uuid.uuid4(),
            expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_ttl_days),
        )
    )
    return TokenOut(
        access_token=create_access_token(str(user.id), user.role.name),
        refresh_token=refresh_token,
        expires_in=settings.access_token_ttl_seconds,
        user=UserSummary(id=user.id, full_name=user.full_name, role=user.role.name),
    )


def login(db: Session, email: str, password: str) -> TokenOut:
    if login_throttle.is_blocked(email):
        raise AppError(429, "RATE_LIMITED", "Too many failed attempts. Try again later")
    user = user_repository.get_by_email(db, email)
    password_ok = verify_password(password, user.password_hash if user else DUMMY_PASSWORD_HASH)
    if not user or not password_ok or not user.is_active:
        login_throttle.record_failure(email)
        raise AppError(401, "AUTH_INVALID", "Email or password is incorrect")
    login_throttle.clear(email)
    tokens = _issue_tokens(db, user)
    db.commit()
    return tokens


def refresh(db: Session, refresh_token: str) -> TokenOut:
    row = token_repository.get_by_hash_for_update(db, hash_refresh_token(refresh_token))
    if row is None:
        raise AppError(401, "AUTH_REVOKED", "Session expired, please sign in again")

    now = datetime.now(UTC)
    # A revoked token coming back may mean it was stolen, so end the whole session.
    if row.revoked_at is not None:
        token_repository.revoke_family(db, row.family_id, now)
        db.commit()
        raise AppError(401, "AUTH_REVOKED", "Session expired, please sign in again")
    if row.expires_at <= now:
        raise AppError(401, "AUTH_EXPIRED", "Session expired, please sign in again")

    user = user_repository.get_by_id(db, row.user_id)
    if not user.is_active:
        token_repository.revoke_family(db, row.family_id, now)
        db.commit()
        raise AppError(401, "AUTH_REVOKED", "Session expired, please sign in again")

    row.revoked_at = now
    tokens = _issue_tokens(db, user, row.family_id)
    db.commit()
    return tokens


def logout(db: Session, user: User, refresh_token: str) -> None:
    row = token_repository.get_by_hash_for_update(db, hash_refresh_token(refresh_token))
    # Revokes the family, because a refresh just before logout leaves a newer token in it.
    if row is not None and row.user_id == user.id:
        token_repository.revoke_family(db, row.family_id, datetime.now(UTC))
        db.commit()


def signup(db: Session, body: SignupIn) -> SignupOut:
    # Open signup is safe because it only creates a new, empty company. It never joins an existing one.
    admin = user_repository.get_role(db, "admin")
    organization = Organization(
        name=body.company_name,
        industry=body.industry or "General",
        widget_key=f"wk_{secrets.token_urlsafe(24)}",
    )
    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        role=admin,
    )
    db.add_all([organization, user, Membership(user=user, organization=organization, role=admin)])
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise AppError(409, "CONFLICT", "An account with that email already exists") from None
    tokens = _issue_tokens(db, user)
    db.commit()
    return SignupOut(**tokens.model_dump(), organization_id=organization.id)


def me(user: User) -> MeOut:
    # The frontend picks the workspace from memberships, so X-Organization-Id does not apply here.
    return MeOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role.name,
        permissions=sorted(p.code for p in user.role.permissions),
        memberships=[
            MembershipOut(organization=OrganizationOut.model_validate(m.organization), role=m.role.name)
            for m in user.memberships
        ],
    )
