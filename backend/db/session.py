"""Database session management with async SQLAlchemy."""

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from config import settings

# Create async engine
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DATABASE_ECHO,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
)

# Session factory
async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncSession:
    """Dependency that provides a database session."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """Initialize database tables (for development)."""
    from db.base import Base
    from sqlalchemy import text
    # Import all models so they are registered with Base.metadata
    import models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        try:
            await conn.execute(text("ALTER TABLE scans ADD COLUMN IF NOT EXISTS file_hashes JSONB;"))
            await conn.execute(text("ALTER TABLE scans ADD COLUMN IF NOT EXISTS findings_diff JSONB;"))
            await conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS telegram_topic_id INTEGER;"))
            await conn.execute(text("ALTER TABLE scans ADD COLUMN IF NOT EXISTS telegram_message_id INTEGER;"))
        except Exception:
            pass


async def close_db():
    """Close database connections."""
    await engine.dispose()
