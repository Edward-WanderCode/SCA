"""
Security utilities for JWT token management and password hashing.
"""

from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from passlib.context import CryptContext

# Password hashing context — bcrypt with auto-upgrade
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


import redis.asyncio as aioredis
import logging

from config import settings

logger = logging.getLogger(__name__)

# Redis client for token blacklist (lazy initialized)

_redis_client: aioredis.Redis | None = None

# Token blacklist key prefix
TOKEN_BLACKLIST_PREFIX = "token_blacklist:"


async def get_redis_client() -> aioredis.Redis:
    """Get or create async Redis client for token blacklist."""
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
        )
    return _redis_client


# === Password Utilities ===

def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


# === JWT Token Utilities ===

def create_access_token(
    subject: str,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    """Create a JWT access token."""
    expires_delta = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    expire = datetime.now(timezone.utc) + expires_delta

    to_encode = {
        "sub": subject,
        "exp": expire,
        "type": "access",
    }
    if extra_claims:
        to_encode.update(extra_claims)

    return jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def create_refresh_token(subject: str) -> str:
    """Create a JWT refresh token."""
    expires_delta = timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
    expire = datetime.now(timezone.utc) + expires_delta

    to_encode = {
        "sub": subject,
        "exp": expire,
        "type": "refresh",
    }

    return jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def verify_token(token: str) -> dict[str, Any] | None:
    """
    Verify and decode a JWT token.
    Returns the payload dict if valid, None if invalid/expired.
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return payload
    except jwt.PyJWTError:
        return None



# === Token Blacklist (Redis) ===

async def blacklist_token(token: str, expires_in_seconds: int) -> None:
    """Add a token to the blacklist in Redis."""
    try:
        redis = await get_redis_client()
        key = f"{TOKEN_BLACKLIST_PREFIX}{token}"
        await redis.setex(key, expires_in_seconds, "1")
    except Exception as e:
        logger.warning(f"Failed to blacklist token in Redis: {e}")


async def is_token_blacklisted(token: str) -> bool:
    """Check if a token is blacklisted."""
    try:
        redis = await get_redis_client()
        key = f"{TOKEN_BLACKLIST_PREFIX}{token}"
        result = await redis.get(key)
        return result is not None
    except Exception as e:
        logger.warning(f"Failed to check token blacklist in Redis: {e}")
        return False
