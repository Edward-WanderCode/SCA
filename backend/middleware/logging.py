import time
import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from loguru import logger
from core.metrics import api_request_latency, api_requests_total

class LoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware to attach a correlation ID (request_id) to each request,
    log the request lifecycle, and record API latency metrics.
    """
    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        
        # Bind the request_id to loguru context
        with logger.contextualize(request_id=request_id):
            start_time = time.time()
            
            # Log request start (only for API routes, skip health/metrics to avoid spam)
            is_api = request.url.path.startswith("/api/") and not request.url.path.endswith("/health")
            if is_api:
                logger.info(f"Request started: {request.method} {request.url.path}")

            try:
                response = await call_next(request)
                
                process_time = time.time() - start_time
                status_code = response.status_code
                
                if is_api:
                    logger.info(
                        f"Request completed: {request.method} {request.url.path} - "
                        f"Status: {status_code} - "
                        f"Duration: {process_time:.3f}s"
                    )
                    
                # Record metrics
                api_requests_total.labels(
                    method=request.method,
                    endpoint=request.url.path,
                    status=str(status_code)
                ).inc()
                
                api_request_latency.labels(
                    method=request.method,
                    endpoint=request.url.path
                ).observe(process_time)

                # Attach request_id to response headers
                response.headers["X-Request-ID"] = request_id
                
                return response
                
            except Exception as e:
                process_time = time.time() - start_time
                logger.exception(
                    f"Request failed: {request.method} {request.url.path} - "
                    f"Duration: {process_time:.3f}s"
                )
                
                api_requests_total.labels(
                    method=request.method,
                    endpoint=request.url.path,
                    status="500"
                ).inc()
                raise
