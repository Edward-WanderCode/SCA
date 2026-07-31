"""System settings schemas."""

from pydantic import BaseModel
from typing import Optional


class SystemSettingsResponse(BaseModel):
    """Response schema for system settings."""
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    telegram_bot_command_thread_id: Optional[int] = 306
    opengrep_image: str = "opengrep/opengrep:latest"
    trivy_image: str = "aquasec/trivy:latest"
    trufflehog_image: str = "trufflesecurity/trufflehog:latest"
    max_concurrent_scans: int = 3


class SystemSettingsUpdate(BaseModel):
    """Update schema for system settings."""
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    telegram_bot_command_thread_id: Optional[int] = None
    opengrep_image: Optional[str] = None
    trivy_image: Optional[str] = None
    trufflehog_image: Optional[str] = None
    max_concurrent_scans: Optional[int] = None


class TelegramTestPayload(BaseModel):
    """Payload to test Telegram connection."""
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    telegram_bot_command_thread_id: Optional[int] = None
