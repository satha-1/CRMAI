import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_membership, require_permission
from app.models import Membership
from app.schemas.business import StaffIn, StaffOut, StaffPage, StaffUpdate
from app.services import staff_service

router = APIRouter(prefix="/users", tags=["staff"])


@router.get("", response_model=StaffPage)
def list_staff(membership: Membership = Depends(get_membership), db: Session = Depends(get_db)):
    # Every member can read this, because the pages for assigning work need the list of people.
    return staff_service.list_staff(db, membership.organization_id)


@router.post("", response_model=StaffOut, status_code=status.HTTP_201_CREATED)
def add_staff(
    body: StaffIn,
    membership: Membership = Depends(require_permission("user.manage")),
    db: Session = Depends(get_db),
):
    return staff_service.add_staff(db, membership.organization_id, body)


@router.patch("/{user_id}", response_model=StaffOut)
def update_staff(
    user_id: uuid.UUID,
    body: StaffUpdate,
    membership: Membership = Depends(require_permission("user.manage")),
    db: Session = Depends(get_db),
):
    return staff_service.update_staff(db, membership, user_id, body)
