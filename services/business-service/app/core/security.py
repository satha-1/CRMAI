from functools import lru_cache

import jwt

from app.core.config import get_settings
from app.core.errors import AppError

ALGORITHM = "RS256"
CLOCK_SKEW_SECONDS = 30


@lru_cache
def _public_key() -> str:
    return get_settings().jwt_public_key_path.read_text()


def decode_access_token(token: str) -> dict:
    """Verifies a token from auth-service. Kong does not check expiry, so this must."""
    try:
        claims = jwt.decode(
            token,
            _public_key(),
            algorithms=[ALGORITHM],
            issuer=get_settings().jwt_issuer,
            leeway=CLOCK_SKEW_SECONDS,
            options={"require": ["exp", "iat", "iss", "sub"]},
        )
    except jwt.ExpiredSignatureError:
        raise AppError(401, "AUTH_EXPIRED", "Session expired") from None
    except jwt.InvalidTokenError:
        raise AppError(401, "AUTH_INVALID", "Please sign in") from None
    if claims.get("type") != "access":
        raise AppError(401, "AUTH_INVALID", "Please sign in")
    return claims
