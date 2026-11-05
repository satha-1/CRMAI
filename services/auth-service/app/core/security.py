import base64
import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from functools import lru_cache

import bcrypt
import jwt

from app.core.config import get_settings
from app.core.errors import AppError

ALGORITHM = "RS256"
CLOCK_SKEW_SECONDS = 30


def _prehash(password: str) -> bytes:
    # bcrypt rejects input over 72 bytes, and the API allows 128 characters.
    return base64.b64encode(hashlib.sha256(password.encode()).digest())


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_prehash(password), bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(_prehash(password), password_hash.encode())


# Checked for unknown emails, so login takes the same time whether or not the account exists.
DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(32))


@lru_cache
def _private_key() -> str:
    return get_settings().jwt_private_key_path.read_text()


@lru_cache
def _public_key() -> str:
    return get_settings().jwt_public_key_path.read_text()


def create_access_token(user_id: str, role: str) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    claims = {
        "iss": settings.jwt_issuer,
        "sub": user_id,
        "role": role,
        "type": "access",
        "iat": now,
        "exp": now + timedelta(seconds=settings.access_token_ttl_seconds),
    }
    return jwt.encode(claims, _private_key(), algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
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


def new_refresh_token() -> str:
    return secrets.token_urlsafe(32)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
