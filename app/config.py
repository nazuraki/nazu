"""Application configuration loaded from environment variables."""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Database
    database_url: str = "postgresql://nazu:password@localhost:5432/nazu"
    db_pool_min_size: int = 2
    db_pool_max_size: int = 10

    # Embeddings
    openai_api_key: str = ""
    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 1536

    # Additional API keys (optional, used by embedding eval and future integrations)
    anthropic_api_key: str = ""
    gemini_api_key: str = ""


settings = Settings()
