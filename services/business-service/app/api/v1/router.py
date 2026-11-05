from fastapi import APIRouter

from app.api.v1.endpoints import organizations, staff

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(staff.router)
api_router.include_router(organizations.router)
