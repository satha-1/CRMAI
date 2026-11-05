from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    jwt_private_key_path: Path
    jwt_public_key_path: Path
    # Kong finds the verification key using this claim (see gateway/kong.yml).
    jwt_issuer: str = "crmai-auth"
    access_token_ttl_seconds: int = 900
    refresh_token_ttl_days: int = 7


@lru_cache
def get_settings() -> Settings:
    return Settings()
