"""SCA Platform — FastAPI Application Entry Point."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from db.session import init_db, close_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown events."""
    # Startup
    await init_db()
    
    # Start Telegram Bot Polling in background
    import asyncio
    from utils.telegram_bot import start_telegram_bot_polling
    polling_task = asyncio.create_task(start_telegram_bot_polling())
    
    yield
    # Shutdown
    polling_task.cancel()
    try:
        await polling_task
    except asyncio.CancelledError:
        pass
        
    await close_db()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Comprehensive Static Code Analysis Platform",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# === Middleware Stack (order matters: last added = first executed) ===

# Security Headers Middleware
from middleware import SecurityHeadersMiddleware
app.add_middleware(SecurityHeadersMiddleware)

# CORS Middleware — hardened with explicit methods and headers
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
    max_age=3600,
)

# Rate Limiting
from core.rate_limit import register_rate_limiter
register_rate_limiter(app)

# Exception Handlers
from api.error_handlers import register_exception_handlers
register_exception_handlers(app)

# Register routers
from api.routes import projects, scans, results, dashboard  # noqa: E402
from api.routes import auth  # noqa: E402

app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(projects.router, prefix="/api/projects", tags=["Projects"])
app.include_router(scans.router, prefix="/api/scans", tags=["Scans"])
app.include_router(results.router, prefix="/api/findings", tags=["Findings"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])


@app.get("/api/health", tags=["Health"])
async def health_check():
    """Health check endpoint (unauthenticated)."""
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
    }

