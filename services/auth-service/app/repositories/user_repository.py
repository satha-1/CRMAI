import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Role, User


def get_by_id(db: Session, user_id: uuid.UUID) -> User | None:
    return db.get(User, user_id)


def get_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email))


def get_role(db: Session, name: str) -> Role:
    return db.scalars(select(Role).where(Role.name == name)).one()
