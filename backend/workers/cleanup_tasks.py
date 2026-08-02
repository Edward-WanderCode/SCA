"""
Celery tasks for background resource cleanup.
"""
import os
import shutil
import time
from pathlib import Path
from datetime import datetime, timedelta, timezone
from loguru import logger

from config import settings
from models.scan import Scan, ScanStatus
from workers.celery_app import celery_app
from workers.db import SyncSession

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
        def _force_remove_readonly(func, path, _):
            import stat
            try:
                os.chmod(path, stat.S_IWRITE)
                func(path)
            except Exception:
                pass

        # Clean up orphaned project folders
        projects_dir = workspace_dir / "projects"
        if projects_dir.exists():
            session = SyncSession()
            try:
                from models.project import Project
                active_project_ids = {str(p.id) for p in session.query(Project.id).all()}
                for p_entry in projects_dir.iterdir():
                    if p_entry.is_dir() and p_entry.name not in active_project_ids:
                        try:
                            shutil.rmtree(p_entry, onerror=_force_remove_readonly)
                            logger.info(f"Deleted orphaned project directory: {p_entry}")
                            deleted_count += 1
                        except Exception as e:
                            logger.error(f"Failed to delete orphaned project directory {p_entry}: {e}")
            finally:
                session.close()

        # Clean up old temp workspace directories
        for entry in workspace_dir.iterdir():
            if entry.is_dir() and entry.name != "projects":
                mtime = entry.stat().st_mtime
                if mtime < cutoff_time:
                    try:
                        shutil.rmtree(entry, onerror=_force_remove_readonly)
                        logger.info(f"Deleted old workspace: {entry}")
                        deleted_count += 1
                    except Exception as e:
                        logger.error(f"Failed to delete old workspace {entry}: {e}")
                        
        logger.info(f"Workspace cleanup completed. Deleted {deleted_count} old/orphaned directories.")
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
