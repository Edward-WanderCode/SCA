"""Application configuration using Pydantic Settings."""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    APP_NAME: str = "SCA Platform"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    API_PREFIX: str = "/api"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://sca_user:sca_password@localhost:5432/sca_platform"
    DATABASE_ECHO: bool = False

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"

    # Scanner Docker Images
    OPENGREP_IMAGE: str = "opengrep/opengrep:latest"
    TRIVY_IMAGE: str = "aquasec/trivy:latest"
    TRUFFLEHOG_IMAGE: str = "trufflesecurity/trufflehog:latest"
    BANDIT_IMAGE: str = "ghcr.io/pycqa/bandit/bandit:latest"
    GOSEC_IMAGE: str = "securego/gosec:latest"

    # Workspace
    USE_LOCAL_OPENGREP: bool = True
    SCAN_WORKSPACE_DIR: str = "/app/workspace"
    HOST_CODE_DIR: str = "/app/host_code"
    MAX_CONCURRENT_SCANS: int = 3

    # Telegram
    TELEGRAM_BOT_TOKEN: Optional[str] = None
    TELEGRAM_CHAT_ID: Optional[str] = None
    TELEGRAM_BOT_COMMAND_THREAD_ID: int = 306

    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
    }


settings = Settings()
