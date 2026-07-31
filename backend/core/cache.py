"""Redis caching functionality."""

import json
from functools import wraps
from typing import Any, Callable
import redis.asyncio as redis
from config import settings
import logging

logger = logging.getLogger(__name__)

# Initialize Redis client pool
redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)

def cache(key_prefix: str, ttl: int = 300) -> Callable:
    """
    Decorator for caching asynchronous function results in Redis.
    
    Args:
        key_prefix: Prefix for the Redis cache key
        ttl: Time to live in seconds (default 300s / 5 minutes)
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            try:
                # Generate a unique cache key based on prefix and stringified arguments
                # Note: kwargs order isn't guaranteed, sorting them is better for stability
                sorted_kwargs = tuple(sorted(kwargs.items()))
                cache_key = f"{key_prefix}:{hash(str(args) + str(sorted_kwargs))}"
                
                # Try to get from cache
                cached = await redis_client.get(cache_key)
                if cached:
                    logger.debug(f"Cache hit for key: {cache_key}")
                    return json.loads(cached)
                
                # Cache miss, execute function
                result = await func(*args, **kwargs)
                
                # Check if result is Pydantic model and get dict, else use as is
                if hasattr(result, "model_dump"):
                    serializable = result.model_dump(mode="json")
                else:
                    serializable = result
                
                # Cache the result
                await redis_client.setex(cache_key, ttl, json.dumps(serializable))
                logger.debug(f"Cache set for key: {cache_key}")
                
                return result
            except Exception as e:
                # Fallback to normal execution if Redis fails
                logger.error(f"Redis cache error: {e}")
                return await func(*args, **kwargs)
                
        return wrapper
    return decorator

async def invalidate_cache(key_pattern: str) -> None:
    """Invalidate cache keys matching a pattern."""
    try:
        keys = await redis_client.keys(f"{key_pattern}*")
        if keys:
            await redis_client.delete(*keys)
            logger.info(f"Invalidated {len(keys)} cache keys matching {key_pattern}")
    except Exception as e:
        logger.error(f"Failed to invalidate cache: {e}")


def invalidate_cache_sync(key_pattern: str) -> None:
    """Synchronous cache invalidation for Celery workers."""
    try:
        import redis as sync_redis
        client = sync_redis.from_url(settings.REDIS_URL, decode_responses=True)
        keys = client.keys(f"{key_pattern}*")
        if keys:
            client.delete(*keys)
            logger.info(f"Synchronously invalidated {len(keys)} cache keys matching {key_pattern}")
        client.close()
    except Exception as e:
        logger.error(f"Failed to synchronously invalidate cache: {e}")


async def clear_all_api_caches() -> None:
    """Clear all findings, dashboard, and project caches asynchronously."""
    await invalidate_cache("findings")
    await invalidate_cache("dashboard")
    await invalidate_cache("projects")


def clear_all_api_caches_sync() -> None:
    """Clear all findings, dashboard, and project caches synchronously."""
    invalidate_cache_sync("findings")
    invalidate_cache_sync("dashboard")
    invalidate_cache_sync("projects")

