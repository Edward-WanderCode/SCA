"""Shared API dependencies."""

from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends
from db.session import get_db


async def get_session(session: AsyncSession = Depends(get_db)) -> AsyncSession:
    """Get database session dependency."""
    return session
