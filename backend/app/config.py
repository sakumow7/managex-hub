from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "postgresql+psycopg://workorders:local-development-only@localhost:5432/workorders"
    jwt_secret: str = Field(min_length=32)
    token_minutes: int = 60
    demo_enabled: bool = False
    demo_minutes: int = Field(default=60, ge=5, le=180)
    demo_max_workspaces: int = Field(default=30, ge=1, le=100)
    demo_max_mutations: int = Field(default=100, ge=10, le=500)
    cors_origins: list[str] = []

    @field_validator("database_url")
    @classmethod
    def use_psycopg(cls, value):
        # Neon supplies postgresql:// URLs; this project uses psycopg 3.
        for prefix in ("postgres://", "postgresql://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value[len(prefix) :]
        return value


@lru_cache
def settings() -> Settings:
    return Settings()
