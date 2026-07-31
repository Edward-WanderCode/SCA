"""
Celery tasks for background resource cleanup.
"""
import os
import shutil
import time
from pathlib import Path
from datetime import datetime, timedelta, timezone
from loguru import logger
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from config import settings
from models.scan import Scan, ScanStatus
from workers.celery_app import celery_app

sync_db_url = settings.DATABASE_URL.replace("+asyncpg", "").replace("postgresql://", "postgresql+psycopg2://")
if "postgresql+psycopg2" not in sync_db_url and "postgresql://" in sync_db_url:
    sync_db_url = sync_db_url.replace("postgresql://", "postgresql+psycopg2://")

sync_engine = create_engine(sync_db_url, pool_size=2)
SyncSession = sessionmaker(bind=sync_engine)

@celery_app.task(name="workers.cleanup_tasks.cleanup_old_workspaces")
def cleanup_old_workspaces():
    """
    Remove scan workspaces that are older than 7 days.
    """
    workspace_dir = Path(settings.SCAN_WORKSPACE_DIR)
    if not workspace_dir.exists():
        logger.warning(f"Workspace directory {workspace_dir} does not exist.")
        return

    cutoff_time = time.time() - (7 * 24 * 60 * 60) # 7 days ago
    deleted_count = 0

    try:
        for entry in workspace_dir.iterdir():
            if entry.is_dir():
                # Check modification time
                mtime = entry.stat().st_mtime
                if mtime < cutoff_time:
                    try:
                        shutil.rmtree(entry)
                        logger.info(f"Deleted old workspace: {entry}")
                        deleted_count += 1
                    except Exception as e:
                        logger.error(f"Failed to delete old workspace {entry}: {e}")
                        
        logger.info(f"Workspace cleanup completed. Deleted {deleted_count} old directories.")
    except Exception as e:
        logger.error(f"Error during workspace cleanup: {e}")


@celery_app.task(name="workers.cleanup_tasks.cleanup_failed_scans")
def cleanup_failed_scans():
    """
    Clean up lingering resources for scans that failed or have been stuck in RUNNING for > 24 hours.
    """
    session = SyncSession()
    cutoff_time = datetime.now(timezone.utc) - timedelta(hours=24)
    
    try:
        stuck_scans = (
            session.query(Scan)
            .filter(Scan.status == ScanStatus.RUNNING)
            .filter(Scan.started_at < cutoff_time)
            .all()
        )
        
        for scan in stuck_scans:
            logger.warning(f"Scan {scan.id} stuck in RUNNING for >24h. Marking as FAILED.")
            scan.status = ScanStatus.FAILED
            scan.progress_message = "Scan timed out (system cleanup)"
            scan.error_message = "Scan was stuck in RUNNING state for over 24 hours."
            scan.completed_at = datetime.now(timezone.utc)
            
            # Clean up workspace
            workspace_path = Path(settings.SCAN_WORKSPACE_DIR) / str(scan.id)
            if workspace_path.exists():
                shutil.rmtree(workspace_path, ignore_errors=True)
                
        session.commit()
        if stuck_scans:
            logger.info(f"Cleaned up {len(stuck_scans)} stuck scans.")
            
    except Exception as e:
        session.rollback()
        logger.error(f"Error during failed scans cleanup: {e}")
    finally:
        session.close()
