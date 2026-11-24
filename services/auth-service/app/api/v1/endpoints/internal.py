from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.auth import AccountIn, AccountOut
from app.services import auth_service

# Kong has no route to /internal and this service publishes no port, so only other containers reach it.
router = APIRouter(prefix="/internal", tags=["internal"])


@router.post("/accounts", response_model=AccountOut)
def find_or_create_account(body: AccountIn, db: Session = Depends(get_db)):
    return auth_service.find_or_create_account(db, body)
