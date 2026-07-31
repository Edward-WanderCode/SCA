"""Celery application configuration."""

from celery import Celery
from celery.schedules import crontab
from config import settings

celery_app = Celery(
    "sca_platform",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["workers.tasks", "workers.cleanup_tasks", "workers.schedule_tasks"],
)

celery_app.conf.beat_schedule = {
    'cleanup-old-workspaces-daily': {
        'task': 'workers.cleanup_tasks.cleanup_old_workspaces',
        'schedule': crontab(hour=2, minute=0),  # Run daily at 2:00 AM UTC
    },
    'cleanup-failed-scans-hourly': {
        'task': 'workers.cleanup_tasks.cleanup_failed_scans',
        'schedule': crontab(minute=15),  # Run every hour at minute 15
    },
    'trigger-scheduled-scans-minutely': {
        'task': 'workers.schedule_tasks.trigger_scheduled_scans',
        'schedule': crontab(minute='*'),  # Run every minute to check cron schedules
    },
}

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
