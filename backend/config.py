"""Application configuration using Pydantic Settings."""

from pydantic_settings import BaseSettings
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    APP_NAME: str = "SCA Platform"
    APP_VERSION: str = "2.0.0"
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

    # JWT Authentication
    JWT_SECRET_KEY: str = "change-this-to-a-secure-random-string-at-least-32-chars"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Password Policy
    PASSWORD_MIN_LENGTH: int = 8

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
    MAX_CONCURRENT_SCANS: int = 6

    # Telegram
    TELEGRAM_BOT_TOKEN: Optional[str] = None
    TELEGRAM_CHAT_ID: Optional[str] = None
    TELEGRAM_BOT_COMMAND_THREAD_ID: int = 306
    TELEGRAM_BOT_API_URL: str = "https://api.telegram.org"

    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]

    # CI/CD Webhooks
    GITHUB_TOKEN: Optional[str] = None
    GITLAB_TOKEN: Optional[str] = None

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
    }


settings = Settings()

# Warn about insecure JWT secret
if settings.JWT_SECRET_KEY == "change-this-to-a-secure-random-string-at-least-32-chars":
    logger.warning(
        "⚠️  Using default JWT_SECRET_KEY! Set a strong secret in production via environment variable."
    )
elif len(settings.JWT_SECRET_KEY) < 32:
    logger.warning(
        "⚠️  JWT_SECRET_KEY is shorter than 32 characters. Use a longer key for security."
    )

