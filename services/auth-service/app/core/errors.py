import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

logger = logging.getLogger(__name__)


class AppError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status = status
        self.code = code
        self.message = message


def _error_response(request: Request, status: int, code: str, message: str, details: list | None = None):
    # Same error body as docs/api/API-SPECIFICATION.md. Kong sets X-Request-ID.
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    body = {"code": code, "message": message, "details": details or [], "request_id": request_id}
    return JSONResponse({"error": body}, status_code=status)


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error(request: Request, exc: AppError):
        return _error_response(request, exc.status, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        # Build this by hand, because the default response echoes the input, including passwords.
        details = [
            {"field": ".".join(str(part) for part in e["loc"] if part != "body"), "issue": e["type"]}
            for e in exc.errors()
        ]
        first = exc.errors()[0]
        message = f"{details[0]['field']}: {first['msg']}"
        return _error_response(request, 400, "VALIDATION_ERROR", message, details)

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        return _error_response(request, exc.status_code, "NOT_FOUND", "Not found")

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, exc: Exception):
        logger.exception("Unhandled error", exc_info=exc)
        return _error_response(request, 500, "INTERNAL", "Something went wrong")
