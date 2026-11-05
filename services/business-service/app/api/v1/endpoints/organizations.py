from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, get_membership, require_permission
from app.models import Membership, User
from app.schemas.business import OrganizationIn, OrganizationOut, OrganizationUpdate
from app.services import organization_service

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.post("", response_model=OrganizationOut, status_code=status.HTTP_201_CREATED)
def create_organization(body: OrganizationIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return organization_service.create(db, user, body)


@router.get("/current", response_model=OrganizationOut)
def current_organization(membership: Membership = Depends(get_membership)):
    return membership.organization


@router.patch("/current", response_model=OrganizationOut)
def update_organization(
    body: OrganizationUpdate,
    membership: Membership = Depends(require_permission("org.manage")),
    db: Session = Depends(get_db),
):
    return organization_service.update(db, membership.organization, body)


@router.post("/current/rotate-widget-key", response_model=OrganizationOut)
def rotate_widget_key(
    membership: Membership = Depends(require_permission("org.manage")),
    db: Session = Depends(get_db),
):
    return organization_service.rotate_widget_key(db, membership.organization)
