"""Tasks for handling scheduled scans."""

import logging
from datetime import datetime, timezone
from croniter import croniter
from sqlalchemy.orm import Session
from workers.celery_app import celery_app
from workers.tasks import SyncSession, run_scan
from models.project import Project
from models.scan import Scan, ScanType, ScanStatus

logger = logging.getLogger(__name__)

@celery_app.task(name="workers.schedule_tasks.trigger_scheduled_scans")
def trigger_scheduled_scans():
    """Check all projects for scheduled scans and trigger them if due."""
    session = SyncSession()
    try:
        # Find all projects with a cron schedule
        projects = session.query(Project).filter(Project.cron_schedule.isnot(None)).all()
        now = datetime.now(timezone.utc)
        
        for project in projects:
            try:
                # Check if it's due
                cron = croniter(project.cron_schedule, now)
                # If the previous scheduled time is within the last minute, trigger it
                prev_run = cron.get_prev(datetime)
                
                # Check if we already have a pending or running scan for this project
                active_scan = session.query(Scan).filter(
                    Scan.project_id == project.id,
                    Scan.status.in_([ScanStatus.PENDING, ScanStatus.RUNNING])
                ).first()
                
                # If previous run was within the last 60 seconds and no active scan
                if not active_scan and (now - prev_run).total_seconds() < 60:
                    logger.info(f"Triggering scheduled scan for project {project.id}")
                    
                    scan = Scan(
                        project_id=project.id,
                        scan_type=ScanType.COMBINED,
                        status=ScanStatus.PENDING,
                    )
                    session.add(scan)
                    session.flush()
                    
                    task = run_scan.delay(scan.id, ScanType.COMBINED.value)
                    scan.celery_task_id = task.id
                    session.commit()
            except Exception as e:
                logger.error(f"Failed to check schedule for project {project.id}: {e}")
                session.rollback()
    except Exception as e:
        logger.error(f"Failed to trigger scheduled scans: {e}")
    finally:
        session.close()
