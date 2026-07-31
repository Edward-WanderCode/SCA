"""
Structured logging configuration using loguru.
Replaces the standard python logging module for application code.
"""

import logging
import sys
from loguru import logger
from config import settings

class InterceptHandler(logging.Handler):
    """
    Intercept standard logging messages and route them to loguru.
    """
    def emit(self, record):
        # Get corresponding Loguru level if it exists
        try:
            level = logger.level(record.levelname).name
        except ValueError:
            level = record.levelno

        # Find caller from where originated the logged message
        frame, depth = logging.currentframe(), 2
        while frame.f_code.co_filename == logging.__file__:
            frame = frame.f_back
            depth += 1

        logger.opt(depth=depth, exception=record.exc_info).log(
            level, record.getMessage()
        )


def setup_logging():
    """
    Configure loguru and intercept standard logging.
    """
    # Remove all existing handlers
    logger.remove()

    # Define formats
    dev_format = (
        "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
        "<level>{level: <8}</level> | "
        "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | "
        "{extra} | "
        "<level>{message}</level>"
    )

    # Use JSON format for production, readable text for development
    is_prod = not settings.DEBUG

    if is_prod:
        logger.add(
            sys.stdout,
            format="{message}",
            level="INFO",
            serialize=True,
            enqueue=True,
            backtrace=True,
            diagnose=False,
        )
    else:
        logger.add(
            sys.stdout,
            format=dev_format,
            level="DEBUG",
            enqueue=True,
            backtrace=True,
            diagnose=True,
            colorize=True,
        )

    # Intercept standard library logging
    logging.basicConfig(handlers=[InterceptHandler()], level=0, force=True)

    # Intercept third-party loggers
    for logger_name in ("uvicorn", "uvicorn.access", "uvicorn.error", "fastapi"):
        logging_logger = logging.getLogger(logger_name)
        logging_logger.handlers = [InterceptHandler()]
        logging_logger.propagate = False
        
    logger.info("Structured logging configured.")
