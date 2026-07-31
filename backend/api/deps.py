"""Shared API dependencies for authentication and database access."""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from db.session import get_db
from core.security import verify_token, is_token_blacklisted
from models.user import User, UserRole

# HTTP Bearer token extractor
security_scheme = HTTPBearer(auto_error=False)


async def get_session(session: AsyncSession = Depends(get_db)) -> AsyncSession:
    """Get database session dependency."""
    return session


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Extract and validate JWT token from Authorization header.
    Returns the authenticated User object.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if credentials is None:
        raise credentials_exception

    token = credentials.credentials

    # Verify token signature and expiry
    payload = verify_token(token)
    if payload is None:
        raise credentials_exception

    # Check token type
    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type. Use an access token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check blacklist
    if await is_token_blacklisted(token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Load user from database
    user_id = payload.get("sub")
    if user_id is None:
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Ensure the current user is active."""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account",
        )
    return current_user


async def require_admin(
    current_user: User = Depends(get_current_active_user),
) -> User:
    """Require the current user to have admin role."""
    if current_user.role != UserRole.ADMIN and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


async def require_analyst(
    current_user: User = Depends(get_current_active_user),
) -> User:
    """Require the current user to have analyst or admin role."""
    allowed_roles = {UserRole.ADMIN, UserRole.ANALYST}
    if current_user.role not in allowed_roles and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Analyst or admin access required",
        )
    return current_user

