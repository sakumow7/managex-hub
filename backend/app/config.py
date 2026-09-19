from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "postgresql+psycopg://workorders:local-development-only@localhost:5432/workorders"
    jwt_secret: str = Field(min_length=32)
    token_minutes: int = 60


@lru_cache
def settings() -> Settings:
    return Settings()
