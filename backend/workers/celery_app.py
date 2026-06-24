"""Celery application configuration."""

from celery import Celery
from config import settings

celery_app = Celery(
    "sca_platform",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["workers.tasks"],
)

celery_app.conf.update(
    # Serialization
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",

    # Timezone
    timezone="UTC",
    enable_utc=True,

    # Task settings
    task_track_started=True,
    task_time_limit=1800,  # 30 minutes hard limit
    task_soft_time_limit=1500,  # 25 minutes soft limit
    worker_max_tasks_per_child=50,
    worker_prefetch_multiplier=1,

    # Result settings
    result_expires=3600,  # Results expire after 1 hour

    # Concurrency
    worker_concurrency=settings.MAX_CONCURRENT_SCANS,
)
