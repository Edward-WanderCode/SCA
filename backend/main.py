"""SCA Platform — FastAPI Application Entry Point."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from db.session import init_db, close_db
from core.logging import setup_logging

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown events."""
    # Setup structured logging
    setup_logging()
    
    # Startup
    await init_db()
    
    # Load dynamic system settings from DB into config
    try:
        from db.session import AsyncSessionLocal
        from api.routes.settings import sync_settings_to_config
        async with AsyncSessionLocal() as session:
            await sync_settings_to_config(session)
    except Exception as e:
        pass

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

# Request Logging and correlation ID
from middleware.logging import LoggingMiddleware
app.add_middleware(LoggingMiddleware)

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
from api.routes import projects, scans, results, dashboard, health, webhooks, settings as settings_routes  # noqa: E402
from api.routes import auth  # noqa: E402

app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(projects.router, prefix="/api/projects", tags=["Projects"])
app.include_router(scans.router, prefix="/api/scans", tags=["Scans"])
app.include_router(results.router, prefix="/api/findings", tags=["Findings"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(health.router, prefix="/api", tags=["Health & Metrics"])
app.include_router(webhooks.router, prefix="/api/webhooks", tags=["Webhooks"])
app.include_router(settings_routes.router, prefix="/api/settings", tags=["Settings"])

