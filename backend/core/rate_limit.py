"""
Rate limiting configuration using SlowAPI.
"""

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request
import jwt
from config import settings

def get_user_id_or_ip(request: Request) -> str:
    """Extract user ID from JWT if present, fallback to IP."""
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        try:
            payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
            user_id = payload.get("sub")
            if user_id:
                return f"user:{user_id}"
        except Exception:
            pass
    return f"ip:{get_remote_address(request)}"

def get_dynamic_limit(request: Request) -> str:
    """Return different limits based on user role or auth status."""
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        try:
            payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
            role = payload.get("role", "viewer")
            if role == "admin":
                return "500/minute"
            elif role == "manager":
                return "300/minute"
            else:
                return "100/minute"
        except Exception:
            pass
    # Unauthenticated limit
    return "30/minute"

# Create limiter instance — uses Redis for distributed rate limiting
limiter = Limiter(
    key_func=get_user_id_or_ip,
    storage_uri=settings.REDIS_URL,
    default_limits=[get_dynamic_limit],
    headers_enabled=True,
    strategy="moving-window",
)


def register_rate_limiter(app):
    """Register the rate limiter with the FastAPI application."""
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
