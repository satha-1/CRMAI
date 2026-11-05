from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models import User
from app.schemas.auth import MeOut, SignupIn, SignupOut
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["users"])


@router.post("/signup", response_model=SignupOut, status_code=status.HTTP_201_CREATED)
def signup(body: SignupIn, db: Session = Depends(get_db)):
    return auth_service.signup(db, body)


@router.get("/me", response_model=MeOut)
def me(user: User = Depends(get_current_user)):
    return auth_service.me(user)
