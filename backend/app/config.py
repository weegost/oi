from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# .env 放在專案根目錄，前後端與 docker compose 共用
ROOT_ENV = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_ENV, extra="ignore")

    database_url: str = "postgresql+psycopg://bizpilot:bizpilot@localhost:5432/bizpilot"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash"
    gemini_fallback_models: list[str] = ["gemini-3.8-flash", "gemini-3.5-flash-lite"]
    gemini_embedding_model: str = "gemini-embedding-2"
    cors_origins: list[str] = ["http://localhost:3000"]


settings = Settings()
