from fastapi import FastAPI

from app.api.v1.endpoints import internal
from app.api.v1.router import api_router
from app.core.errors import register_error_handlers

app = FastAPI(title="CRMAI Auth Service")
register_error_handlers(app)
app.include_router(api_router)
app.include_router(internal.router)
