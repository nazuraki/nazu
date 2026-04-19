"""Application configuration loaded from environment variables."""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # PostgreSQL
    database_url: str = "postgresql://nazu:password@localhost:5432/nazu"
    db_pool_min_size: int = 2
    db_pool_max_size: int = 10

    # FalkorDB (Graphiti backend)
    falkordb_uri: str = "bolt://localhost:7687"
    falkordb_user: str = ""
    falkordb_password: str = ""

    # OpenAI — used by Graphiti for entity extraction and embeddings
    openai_api_key: str = ""

    # Optional integrations
    anthropic_api_key: str = ""
    gemini_api_key: str = ""


settings = Settings()
