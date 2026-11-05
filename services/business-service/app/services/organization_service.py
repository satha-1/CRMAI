import secrets

from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import Membership, Organization, OrganizationChannel, User
from app.repositories import membership_repository
from app.schemas.business import OrganizationIn, OrganizationUpdate

# Other channels have no real transport yet, and the app must not claim they are connected.
LIVE_CHANNELS = {"website", "email"}


def _new_widget_key() -> str:
    return f"wk_{secrets.token_urlsafe(24)}"


def create(db: Session, user: User, body: OrganizationIn) -> Organization:
    # Safe for anyone signed in, because it only creates a new, empty company. It never joins an existing one.
    organization = Organization(name=body.name, industry=body.industry or "General", widget_key=_new_widget_key())
    admin = membership_repository.get_role(db, "admin")
    db.add_all([organization, Membership(user=user, organization=organization, role=admin)])
    db.commit()
    return organization


def update(db: Session, organization: Organization, body: OrganizationUpdate) -> Organization:
    changes = body.model_dump(exclude_unset=True, exclude={"channels"})
    for field, value in changes.items():
        if value is None:
            raise AppError(400, "VALIDATION_ERROR", f"{field} cannot be empty")
        setattr(organization, field, value)

    if body.channels is not None:
        saved = {c.code: c for c in organization.channel_settings}
        current = {c["code"]: c["is_enabled"] for c in organization.channels}
        for channel in body.channels:
            if channel.is_enabled and not current[channel.code] and channel.code not in LIVE_CHANNELS:
                raise AppError(400, "VALIDATION_ERROR", f"{channel.code} is not available yet")
            if channel.code in saved:
                saved[channel.code].is_enabled = channel.is_enabled
            else:
                row = OrganizationChannel(code=channel.code, is_enabled=channel.is_enabled)
                organization.channel_settings.append(row)
                saved[channel.code] = row

    db.commit()
    db.refresh(organization)
    return organization


def rotate_widget_key(db: Session, organization: Organization) -> Organization:
    organization.widget_key = _new_widget_key()
    db.commit()
    return organization
