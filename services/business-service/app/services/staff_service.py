import uuid

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import Membership
from app.repositories import membership_repository
from app.schemas.business import StaffIn, StaffOut, StaffPage, StaffUpdate
from app.services import auth_client

MANAGER_OF = {"marketing_executive": "marketing_manager", "sales_executive": "sales_manager"}


def _view(membership: Membership) -> StaffOut:
    user = membership.user
    return StaffOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=membership.role.name,
        is_active=membership.is_active and user.is_active,
        created_at=user.created_at,
        manager_id=membership.manager_id,
    )


def _check_manager(db: Session, organization_id: uuid.UUID, role: str, manager_id: uuid.UUID | None) -> None:
    """An executive can only report to an active manager of their own team, in this company."""
    if manager_id is None:
        return
    needed = MANAGER_OF.get(role)
    if needed is None:
        raise AppError(400, "VALIDATION_ERROR", "Only executives report to a manager")
    manager = membership_repository.get(db, organization_id, manager_id)
    if manager is None or not manager.is_active or manager.role.name != needed:
        raise AppError(400, "VALIDATION_ERROR", f"Pick an active {needed.split('_')[0]} manager")


def list_staff(db: Session, organization_id: uuid.UUID) -> StaffPage:
    # shortcut: returns everyone because teams are small, add the cursor from the API spec if a company gets large.
    return StaffPage(items=[_view(m) for m in membership_repository.list_for_organization(db, organization_id)])


def add_staff(db: Session, organization_id: uuid.UUID, body: StaffIn) -> StaffOut:
    # Checked first, so a bad request does not leave an account behind.
    _check_manager(db, organization_id, body.role, body.manager_id)
    user_id = auth_client.find_or_create_account(body.email, body.full_name, body.password, body.role)
    if membership_repository.get(db, organization_id, user_id):
        raise AppError(409, "CONFLICT", "That person is already in this workspace")
    membership = Membership(
        user_id=user_id,
        organization_id=organization_id,
        role=membership_repository.get_role(db, body.role),
        manager_id=body.manager_id,
    )
    db.add(membership)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError(409, "CONFLICT", "That person is already in this workspace") from None
    return _view(membership)


def update_staff(db: Session, actor: Membership, target_id: uuid.UUID, body: StaffUpdate) -> StaffOut:
    organization_id = actor.organization_id
    target = membership_repository.get(db, organization_id, target_id)
    # Someone outside this company looks the same as someone who does not exist.
    if target is None:
        raise AppError(404, "NOT_FOUND", "Not found")

    changes = body.model_fields_set
    # Admins cannot demote or deactivate themselves, so a company always keeps an active admin.
    if target_id == actor.user_id and ("role" in changes or body.is_active is False):
        raise AppError(400, "VALIDATION_ERROR", "You cannot deactivate or demote yourself")

    if "role" in changes and body.role is None:
        raise AppError(400, "VALIDATION_ERROR", "Role is required")
    if "is_active" in changes and body.is_active is None:
        raise AppError(400, "VALIDATION_ERROR", "Status is required")

    if body.role and body.role != target.role.name:
        if target.role.name == "admin":
            raise AppError(400, "VALIDATION_ERROR", "An admin's role cannot be changed here")
        target.role = membership_repository.get_role(db, body.role)
        # A new role means a new team, so old reporting lines no longer apply.
        target.manager_id = None
        membership_repository.clear_manager(db, organization_id, target_id)
        # The account's default role only follows when this is the person's only company.
        if len(target.user.memberships) == 1:
            target.user.role_id = target.role.id

    if "manager_id" in changes:
        _check_manager(db, organization_id, target.role.name, body.manager_id)
        target.manager_id = body.manager_id
    if body.is_active is not None:
        target.is_active = body.is_active

    db.commit()
    db.refresh(target)
    return _view(target)
