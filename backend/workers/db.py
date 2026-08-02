"""Shared synchronous database engine for Celery workers.

Celery does not support async, so all worker tasks use this synchronous
engine/session factory instead of the async one used by FastAPI.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from config import settings

# Convert the async DATABASE_URL to a synchronous psycopg2 URL
sync_db_url = settings.DATABASE_URL.replace("+asyncpg", "").replace(
    "postgresql://", "postgresql+psycopg2://"
)
if "postgresql+psycopg2" not in sync_db_url and "postgresql://" in sync_db_url:
    sync_db_url = sync_db_url.replace("postgresql://", "postgresql+psycopg2://")

sync_engine = create_engine(sync_db_url, pool_size=5, max_overflow=2)
SyncSession = sessionmaker(bind=sync_engine)
