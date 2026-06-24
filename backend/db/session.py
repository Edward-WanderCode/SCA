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
    """Initialize database tables (for development) with retry logic."""
    import asyncio
    import logging
    from db.base import Base
    from sqlalchemy import text
    # Import all models so they are registered with Base.metadata
    import models  # noqa: F401

    logger = logging.getLogger(__name__)
    max_retries = 10
    retry_delay = 1  # seconds, will increase exponentially

    for attempt in range(max_retries):
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
                try:
                    await conn.execute(text("ALTER TABLE scans ADD COLUMN IF NOT EXISTS file_hashes JSONB;"))
                    await conn.execute(text("ALTER TABLE scans ADD COLUMN IF NOT EXISTS findings_diff JSONB;"))
                    await conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS telegram_topic_id INTEGER;"))
                    await conn.execute(text("ALTER TABLE scans ADD COLUMN IF NOT EXISTS telegram_message_id INTEGER;"))
                except Exception:
                    pass

            async with engine.connect() as conn:
                try:
                    await conn.execute(text("ALTER TYPE scantype ADD VALUE 'combined';"))
                    await conn.commit()
                except Exception:
                    pass
            
            logger.info("Database initialization successful")
            return
        except Exception as e:
            if attempt < max_retries - 1:
                wait_time = retry_delay * (2 ** attempt)  # exponential backoff
                logger.warning(f"Database connection failed (attempt {attempt + 1}/{max_retries}): {str(e)}. Retrying in {wait_time}s...")
                await asyncio.sleep(wait_time)
            else:
                logger.error(f"Database initialization failed after {max_retries} attempts: {str(e)}")
                raise


async def close_db():
    """Close database connections."""
    await engine.dispose()
