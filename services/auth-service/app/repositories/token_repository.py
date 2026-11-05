import uuid
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models import RefreshToken


def get_by_hash_for_update(db: Session, token_hash: str) -> RefreshToken | None:
    # The row lock stops two requests from rotating the same token at once.
    return db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash).with_for_update())


def revoke_family(db: Session, family_id: uuid.UUID, now: datetime) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now)
    )
