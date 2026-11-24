import json
import logging
import urllib.error
import urllib.request
import uuid

from app.core.config import get_settings
from app.core.errors import AppError

logger = logging.getLogger(__name__)


def find_or_create_account(email: str, full_name: str, password: str | None, role: str) -> uuid.UUID:
    """Asks auth-service for the account, because only that service handles passwords."""
    body = json.dumps({"email": email, "full_name": full_name, "password": password, "role": role}).encode()
    request = urllib.request.Request(
        f"{get_settings().auth_service_url}/internal/accounts", body, {"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return uuid.UUID(json.load(response)["id"])
    except urllib.error.HTTPError as e:
        if e.code == 400:
            raise AppError(400, "VALIDATION_ERROR", json.load(e)["error"]["message"]) from None
        logger.error("auth-service returned %s when creating an account", e.code)
    except (urllib.error.URLError, TimeoutError):
        logger.exception("Could not reach auth-service")
    raise AppError(502, "UPSTREAM_FAILED", "Could not create the account. Try again in a moment")
