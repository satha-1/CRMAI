from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    jwt_public_key_path: Path
    # Must match the issuer in auth-service.
    jwt_issuer: str = "crmai-auth"
    auth_service_url: str = "http://auth-service:8000"


@lru_cache
def get_settings() -> Settings:
    return Settings()
