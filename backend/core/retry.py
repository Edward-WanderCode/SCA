"""
Retry logic for SCA Platform.
Provides standard decorators for retrying transient failures.
"""

from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log
)
import logging
import httpx
import asyncpg
from core.exceptions import ScannerError, GitCloneError

logger = logging.getLogger(__name__)

# Standard retry configuration for external HTTP APIs (e.g., Telegram)
retry_external_api = retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type((httpx.RequestError, httpx.TimeoutException)),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)

# Standard retry configuration for Database operations (e.g., connection lost)
retry_database = retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=0.5, min=1, max=5),
    retry=retry_if_exception_type(asyncpg.exceptions.PostgresError),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)

# Retry configuration for expensive operations like Git Clones
retry_git_clone = retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=2, min=5, max=30),
    retry=retry_if_exception_type(GitCloneError),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)

# Retry configuration for Docker/Scanner operations
retry_scanner = retry(
    stop=stop_after_attempt(2),
    wait=wait_exponential(multiplier=1, min=2, max=5),
    retry=retry_if_exception_type(ScannerError),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)
