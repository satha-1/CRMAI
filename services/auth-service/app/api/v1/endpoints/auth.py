from fastapi import APIRouter, Depends, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models import User
from app.schemas.auth import LoginIn, RefreshIn, TokenOut
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "service": "auth"}


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    return auth_service.login(db, body.email, body.password)


@router.post("/refresh", response_model=TokenOut)
def refresh(body: RefreshIn, db: Session = Depends(get_db)):
    return auth_service.refresh(db, body.refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(body: RefreshIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    auth_service.logout(db, user, body.refresh_token)
