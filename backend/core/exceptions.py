"""
Custom exceptions for SCA Platform.
Provides structured error handling with appropriate HTTP status codes.
"""

from typing import Any


class SCAException(Exception):
    """Base exception for all SCA Platform errors."""
    
    def __init__(
        self,
        message: str,
        status_code: int = 500,
        error_code: str = "INTERNAL_ERROR",
        details: dict[str, Any] | None = None,
    ):
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        self.details = details or {}
        super().__init__(self.message)


# Authentication Errors (401, 403)
class AuthenticationError(SCAException):
    """Authentication failed."""
    
    def __init__(self, message: str = "Authentication failed", details: dict | None = None):
        super().__init__(
            message=message,
            status_code=401,
            error_code="AUTHENTICATION_FAILED",
            details=details,
        )


class InvalidCredentialsError(AuthenticationError):
    """Invalid username or password."""
    
    def __init__(self):
        super().__init__(
            message="Invalid username or password",
            details={"hint": "Check your credentials and try again"},
        )


class TokenExpiredError(AuthenticationError):
    """JWT token has expired."""
    
    def __init__(self):
        super().__init__(
            message="Token has expired",
            details={"hint": "Please refresh your token or login again"},
        )


class InvalidTokenError(AuthenticationError):
    """Invalid JWT token."""
    
    def __init__(self):
        super().__init__(
            message="Invalid or malformed token",
            details={"hint": "Please login again"},
        )


class InsufficientPermissionsError(SCAException):
    """User lacks required permissions."""
    
    def __init__(self, required_role: str | None = None):
        details = {}
        if required_role:
            details["required_role"] = required_role
        
        super().__init__(
            message="Insufficient permissions to perform this action",
            status_code=403,
            error_code="INSUFFICIENT_PERMISSIONS",
            details=details,
        )


# Resource Errors (404)
class ResourceNotFoundError(SCAException):
    """Requested resource not found."""
    
    def __init__(self, resource_type: str, resource_id: str):
        super().__init__(
            message=f"{resource_type} not found",
            status_code=404,
            error_code="RESOURCE_NOT_FOUND",
            details={"resource_type": resource_type, "resource_id": resource_id},
        )


class ProjectNotFoundError(ResourceNotFoundError):
    """Project not found."""
    
    def __init__(self, project_id: str):
        super().__init__("Project", project_id)


class ScanNotFoundError(ResourceNotFoundError):
    """Scan not found."""
    
    def __init__(self, scan_id: str):
        super().__init__("Scan", scan_id)


class FindingNotFoundError(ResourceNotFoundError):
    """Finding not found."""
    
    def __init__(self, finding_id: str):
        super().__init__("Finding", finding_id)


class UserNotFoundError(ResourceNotFoundError):
    """User not found."""
    
    def __init__(self, user_id: str):
        super().__init__("User", user_id)


# Validation Errors (400)
class ValidationError(SCAException):
    """Input validation failed."""
    
    def __init__(self, message: str, field: str | None = None):
        details = {}
        if field:
            details["field"] = field
        
        super().__init__(
            message=message,
            status_code=400,
            error_code="VALIDATION_ERROR",
            details=details,
        )


class DuplicateResourceError(SCAException):
    """Resource already exists."""
    
    def __init__(self, resource_type: str, field: str, value: str):
        super().__init__(
            message=f"{resource_type} with {field}='{value}' already exists",
            status_code=409,
            error_code="DUPLICATE_RESOURCE",
            details={"resource_type": resource_type, "field": field, "value": value},
        )


class InvalidFileError(ValidationError):
    """Invalid file upload."""
    
    def __init__(self, reason: str):
        super().__init__(
            message=f"Invalid file: {reason}",
            field="file",
        )


class FileTooLargeError(ValidationError):
    """File exceeds size limit."""
    
    def __init__(self, max_size_mb: int):
        super().__init__(
            message=f"File size exceeds limit of {max_size_mb}MB",
            field="file",
        )


# Scanner Errors (500, 503)
class ScannerError(SCAException):
    """Scanner execution failed."""
    
    def __init__(self, scanner_name: str, reason: str):
        super().__init__(
            message=f"Scanner '{scanner_name}' failed: {reason}",
            status_code=500,
            error_code="SCANNER_ERROR",
            details={"scanner": scanner_name, "reason": reason},
        )


class ScannerTimeoutError(SCAException):
    """Scanner execution timed out."""
    
    def __init__(self, scanner_name: str, timeout_seconds: int):
        super().__init__(
            message=f"Scanner '{scanner_name}' timed out after {timeout_seconds}s",
            status_code=504,
            error_code="SCANNER_TIMEOUT",
            details={"scanner": scanner_name, "timeout": timeout_seconds},
        )


class GitCloneError(SCAException):
    """Git repository clone failed."""
    
    def __init__(self, repo_url: str, reason: str):
        super().__init__(
            message=f"Failed to clone repository: {reason}",
            status_code=500,
            error_code="GIT_CLONE_ERROR",
            details={"repo_url": repo_url, "reason": reason},
        )


# External Service Errors (502, 503)
class ExternalServiceError(SCAException):
    """External service unavailable or failed."""
    
    def __init__(self, service_name: str, reason: str):
        super().__init__(
            message=f"External service '{service_name}' failed: {reason}",
            status_code=503,
            error_code="EXTERNAL_SERVICE_ERROR",
            details={"service": service_name, "reason": reason},
        )


class TelegramAPIError(ExternalServiceError):
    """Telegram API request failed."""
    
    def __init__(self, reason: str):
        super().__init__("Telegram", reason)


class DatabaseError(SCAException):
    """Database operation failed."""
    
    def __init__(self, operation: str, reason: str):
        super().__init__(
            message=f"Database {operation} failed: {reason}",
            status_code=500,
            error_code="DATABASE_ERROR",
            details={"operation": operation, "reason": reason},
        )


# Rate Limiting (429)
class RateLimitExceededError(SCAException):
    """Rate limit exceeded."""
    
    def __init__(self, limit: str, retry_after: int | None = None):
        details = {"limit": limit}
        if retry_after:
            details["retry_after_seconds"] = retry_after
        
        super().__init__(
            message=f"Rate limit exceeded: {limit}",
            status_code=429,
            error_code="RATE_LIMIT_EXCEEDED",
            details=details,
        )


# Configuration Errors (500)
class ConfigurationError(SCAException):
    """Application misconfiguration."""
    
    def __init__(self, message: str):
        super().__init__(
            message=f"Configuration error: {message}",
            status_code=500,
            error_code="CONFIGURATION_ERROR",
        )
