import uuid

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models import Membership, Role, User


def get(db: Session, organization_id: uuid.UUID, user_id: uuid.UUID) -> Membership | None:
    return db.scalar(
        select(Membership).where(Membership.organization_id == organization_id, Membership.user_id == user_id)
    )


def list_for_organization(db: Session, organization_id: uuid.UUID) -> list[Membership]:
    return list(
        db.scalars(
            select(Membership)
            .join(User, Membership.user_id == User.id)
            .where(Membership.organization_id == organization_id)
            .order_by(User.created_at, User.id)
        )
    )


def clear_manager(db: Session, organization_id: uuid.UUID, manager_id: uuid.UUID) -> None:
    db.execute(
        update(Membership)
        .where(Membership.organization_id == organization_id, Membership.manager_id == manager_id)
        .values(manager_id=None)
    )


def get_role(db: Session, name: str) -> Role:
    return db.scalars(select(Role).where(Role.name == name)).one()
