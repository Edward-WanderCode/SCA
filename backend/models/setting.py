"""SystemSetting model for global dynamic configuration."""

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column
from db.base import Base


class SystemSetting(Base):
    """Represents a global system configuration setting key-value pair."""

    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<SystemSetting(key={self.key}, value={self.value})>"
