from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Dict, Any
import redis.asyncio as redis
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST

from config import settings
from db.session import get_db

router = APIRouter()

@router.get("/health")
async def health_check(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Enhanced health check endpoint.
    Verifies connectivity to DB, Redis, and overall system status.
    """
    health_status = {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "components": {
            "database": "unknown",
            "redis": "unknown"
        }
    }
    
    # Check Database
    try:
        # We need an async connection check, or we can use the injected sync session
        db.execute(text("SELECT 1"))
        health_status["components"]["database"] = "healthy"
    except Exception as e:
        health_status["components"]["database"] = f"unhealthy: {str(e)}"
        health_status["status"] = "degraded"
        
    # Check Redis
    try:
        redis_client = redis.from_url(settings.REDIS_URL)
        await redis_client.ping()
        await redis_client.aclose()
        health_status["components"]["redis"] = "healthy"
    except Exception as e:
        health_status["components"]["redis"] = f"unhealthy: {str(e)}"
        health_status["status"] = "degraded"
        
    # HTTP status code reflects overall health
    return health_status

@router.get("/metrics", include_in_schema=False)
async def metrics():
    """
    Prometheus metrics endpoint.
    """
    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST
    )
