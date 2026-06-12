import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class StealthxSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="STEALTHX_", extra="ignore")

    jwt_secret: str = ""
    jwt_access_minutes: int = 15
    jwt_refresh_days: int = 7
    database_url: str = ""

    @property
    def resolved_jwt_secret(self) -> str:
        return (
            self.jwt_secret
            or os.environ.get("SHOPBOT_SECRET_KEY", "")
            or "stealthx-dev-secret-change-me"
        )

    @property
    def resolved_database_url(self) -> str:
        url = self.database_url or os.environ.get("SHOPBOT_DATABASE_URL") or os.environ.get("DATABASE_URL", "")
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+psycopg://", 1)
        return url


@lru_cache
def get_settings() -> StealthxSettings:
    return StealthxSettings()
