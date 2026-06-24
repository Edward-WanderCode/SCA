"""Celery tasks for async scan execution."""

import logging
from datetime import datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from workers.celery_app import celery_app
from config import settings
from models.scan import Scan, ScanStatus
from models.finding import Finding
from models.project import Project
from services.scan_service import ScanService
from utils.scanner_utils import clone_repository, cleanup_workspace

logger = logging.getLogger(__name__)

# Synchronous engine for Celery workers (Celery doesn't support async)
sync_db_url = settings.DATABASE_URL.replace("+asyncpg", "").replace("postgresql://", "postgresql+psycopg2://")
if "postgresql+psycopg2" not in sync_db_url and "postgresql://" in sync_db_url:
    sync_db_url = sync_db_url.replace("postgresql://", "postgresql+psycopg2://")

sync_engine = create_engine(sync_db_url, pool_size=5, max_overflow=2)
SyncSession = sessionmaker(bind=sync_engine)


def _update_progress(session: Session, scan: Scan, progress: int, message: str):
    """Update scan progress in database."""
    scan.progress = min(progress, 100)
    scan.progress_message = message
    session.commit()
    logger.info(f"Scan {scan.id} progress: {progress}% - {message}")


def handle_rescan_optimization(session: Session, scan: Scan, repo_path: str, scan_type: str) -> tuple[bool, list[dict] | None]:
    """
    Check if we can skip the scan by comparing hashes with the previous completed scan.
    """
    # 1. Calculate hashes of the current files
    from utils.scanner_utils import calculate_directory_hashes
    current_hashes = calculate_directory_hashes(repo_path)
    scan.file_hashes = current_hashes
    session.commit()
    
    # 2. Find the previous completed scan of the same type for this project
    prev_scan = (
        session.query(Scan)
        .filter(
            Scan.project_id == scan.project_id,
            Scan.scan_type == scan.scan_type,
            Scan.status == ScanStatus.COMPLETED,
            Scan.id != scan.id,
        )
        .order_by(Scan.completed_at.desc())
        .first()
    )
    
    if not prev_scan or not prev_scan.file_hashes:
        logger.info(f"No previous completed scan with hashes found for project {scan.project_id} ({scan_type})")
        return False, None
        
    # 3. Compare hashes
    prev_hashes = prev_scan.file_hashes
    
    if current_hashes == prev_hashes:
        logger.info(f"File hashes are identical to scan {prev_scan.id}. Skipping analysis!")
        # Fetch previous findings
        prev_findings = (
            session.query(Finding)
            .filter(Finding.scan_id == prev_scan.id)
            .all()
        )
        
        finding_dicts = []
        for f in prev_findings:
            finding_dicts.append({
                "severity": f.severity,
                "title": f.title,
                "description": f.description,
                "file_path": f.file_path,
                "line_start": f.line_start,
                "line_end": f.line_end,
                "code_snippet": f.code_snippet,
                "rule_id": f.rule_id,
                "cve_id": f.cve_id,
                "cvss_score": f.cvss_score,
                "package_name": f.package_name,
                "package_version": f.package_version,
                "fixed_version": f.fixed_version,
                "detector_type": f.detector_type,
                "verified": f.verified,
                "metadata_json": f.metadata_json,
            })
            
        scan.findings_diff = {
            "added": 0,
            "removed": 0,
            "unmodified": len(prev_findings),
        }
        session.commit()
        return True, finding_dicts
        
    return False, None


def compute_and_save_findings_diff(session: Session, scan: Scan, current_findings: list[Finding]):
    """Compute findings difference compared to the previous completed scan."""
    prev_scan = (
        session.query(Scan)
        .filter(
            Scan.project_id == scan.project_id,
            Scan.scan_type == scan.scan_type,
            Scan.status == ScanStatus.COMPLETED,
            Scan.id != scan.id,
        )
        .order_by(Scan.completed_at.desc())
        .first()
    )
    
    if not prev_scan:
        scan.findings_diff = {
            "added": len(current_findings),
            "removed": 0,
            "unmodified": 0,
        }
        session.commit()
        return
        
    # Get previous findings
    prev_findings = (
        session.query(Finding)
        .filter(Finding.scan_id == prev_scan.id)
        .all()
    )
    
    def get_finding_key(f):
        if isinstance(f, Finding):
            return (
                f.file_path or "",
                f.line_start or 0,
                f.rule_id or "",
                f.title or "",
            )
        else:
            return (
                f.get("file_path") or "",
                f.get("line_start") or 0,
                f.get("rule_id") or "",
                f.get("title") or "",
            )
            
    prev_keys = {get_finding_key(f) for f in prev_findings}
    curr_keys = {get_finding_key(f) for f in current_findings}
    
    added_count = len(curr_keys - prev_keys)
    removed_count = len(prev_keys - curr_keys)
    unmodified_count = len(curr_keys & prev_keys)
    
    scan.findings_diff = {
        "added": added_count,
        "removed": removed_count,
        "unmodified": unmodified_count,
    }
    session.commit()



@celery_app.task(bind=True, name="workers.tasks.run_scan")
def run_scan(self, scan_id: str, scan_type: str):
    """
    Execute a security scan asynchronously.

    Args:
        scan_id: UUID of the Scan record
        scan_type: Type of scan (sast, vulnerability, secret)
    """
    session = SyncSession()
    repo_path = None

    try:
        # Get scan record
        scan = session.query(Scan).filter(Scan.id == scan_id).first()
        if not scan:
            logger.error(f"Scan {scan_id} not found")
            return {"status": "error", "message": "Scan not found"}

        # Update status to running
        scan.status = ScanStatus.RUNNING
        scan.started_at = datetime.now(timezone.utc)
        scan.progress = 10
        scan.progress_message = "Initializing scan..."
        session.commit()

        # Get project info
        project = session.query(Project).filter(Project.id == scan.project_id).first()
        if not project:
            raise ValueError(f"Project {scan.project_id} not found")

        _update_progress(session, scan, 20, "Cloning repository...")

        # Clone repository
        workspace_name = f"{scan.id}"
        repo_path = clone_repository(
            repo_url=project.repo_url,
            target_dir=workspace_name,
            branch=project.branch,
        )

        # Check for rescan optimization
        should_skip, prev_finding_dicts = handle_rescan_optimization(session, scan, repo_path, scan_type)

        if should_skip:
            _update_progress(session, scan, 60, "Restoring findings from identical previous scan...")
            finding_dicts = prev_finding_dicts
        else:
            _update_progress(session, scan, 40, f"Running {scan_type} analysis...")
            logger.info(f"Executing {scan_type} scan for project {project.name}")
            finding_dicts = ScanService.execute_scan(scan_type, repo_path)

        _update_progress(session, scan, 70, "Processing findings...")

        # Save findings to database
        findings_saved = 0
        severity_counts = {}
        added_findings = []

        for fd in finding_dicts:
            finding = Finding(
                scan_id=scan.id,
                severity=fd["severity"],
                title=fd["title"],
                description=fd.get("description"),
                file_path=fd.get("file_path"),
                line_start=fd.get("line_start"),
                line_end=fd.get("line_end"),
                code_snippet=fd.get("code_snippet"),
                rule_id=fd.get("rule_id"),
                cve_id=fd.get("cve_id"),
                cvss_score=fd.get("cvss_score"),
                package_name=fd.get("package_name"),
                package_version=fd.get("package_version"),
                fixed_version=fd.get("fixed_version"),
                detector_type=fd.get("detector_type"),
                verified=fd.get("verified"),
                metadata_json=fd.get("metadata_json"),
            )
            session.add(finding)
            added_findings.append(finding)
            findings_saved += 1

            sev_key = fd["severity"].value if hasattr(fd["severity"], "value") else fd["severity"]
            severity_counts[sev_key] = severity_counts.get(sev_key, 0) + 1

        session.commit()

        # Compute findings difference
        if not should_skip:
            compute_and_save_findings_diff(session, scan, added_findings)

        _update_progress(session, scan, 90, "Finalizing results...")

        # Update scan as completed
        now = datetime.now(timezone.utc)
        scan.status = ScanStatus.COMPLETED
        scan.completed_at = now
        scan.duration_seconds = int((now - scan.started_at).total_seconds())
        scan.progress = 100
        scan.progress_message = "Scan completed"
        scan.summary = {
            "total_findings": findings_saved,
            **severity_counts,
        }
        session.commit()

        logger.info(
            f"Scan {scan_id} completed: {findings_saved} findings "
            f"({severity_counts})"
        )

        return {
            "status": "completed",
            "scan_id": scan_id,
            "findings_count": findings_saved,
            "severity_counts": severity_counts,
        }

    except Exception as e:
        logger.error(f"Scan {scan_id} failed: {e}", exc_info=True)

        # Update scan as failed
        try:
            scan = session.query(Scan).filter(Scan.id == scan_id).first()
            if scan:
                scan.status = ScanStatus.FAILED
                scan.progress = 100
                scan.progress_message = "Scan failed"
                scan.error_message = str(e)[:2000]
                scan.completed_at = datetime.now(timezone.utc)
                if scan.started_at:
                    scan.duration_seconds = int(
                        (scan.completed_at - scan.started_at).total_seconds()
                    )
                session.commit()
        except Exception:
            session.rollback()

        return {"status": "failed", "error": str(e)}

    finally:
        session.close()
        # Cleanup workspace
        if repo_path:
            try:
                cleanup_workspace(str(scan_id))
            except Exception:
                pass


@celery_app.task(bind=True, name="workers.tasks.run_local_scan")
def run_local_scan(self, scan_id: str, scan_type: str, source_path: str):
    """
    Execute a security scan on a pre-extracted local directory (from ZIP upload).

    Args:
        scan_id: UUID of the Scan record
        scan_type: Type of scan (sast, vulnerability, secret)
        source_path: Path to the extracted source code
    """
    session = SyncSession()

    try:
        scan = session.query(Scan).filter(Scan.id == scan_id).first()
        if not scan:
            logger.error(f"Scan {scan_id} not found")
            return {"status": "error", "message": "Scan not found"}

        scan.status = ScanStatus.RUNNING
        scan.started_at = datetime.now(timezone.utc)
        scan.progress = 10
        scan.progress_message = "Initializing local scan..."
        session.commit()

        # Check for rescan optimization
        should_skip, prev_finding_dicts = handle_rescan_optimization(session, scan, source_path, scan_type)

        if should_skip:
            _update_progress(session, scan, 60, "Restoring findings from identical previous scan...")
            finding_dicts = prev_finding_dicts
        else:
            _update_progress(session, scan, 30, f"Running {scan_type} analysis on local code...")
            logger.info(f"Executing {scan_type} local scan on {source_path}")
            finding_dicts = ScanService.execute_scan(scan_type, source_path)

        _update_progress(session, scan, 70, "Processing findings...")

        findings_saved = 0
        severity_counts = {}
        added_findings = []

        for fd in finding_dicts:
            finding = Finding(
                scan_id=scan.id,
                severity=fd["severity"],
                title=fd["title"],
                description=fd.get("description"),
                file_path=fd.get("file_path"),
                line_start=fd.get("line_start"),
                line_end=fd.get("line_end"),
                code_snippet=fd.get("code_snippet"),
                rule_id=fd.get("rule_id"),
                cve_id=fd.get("cve_id"),
                cvss_score=fd.get("cvss_score"),
                package_name=fd.get("package_name"),
                package_version=fd.get("package_version"),
                fixed_version=fd.get("fixed_version"),
                detector_type=fd.get("detector_type"),
                verified=fd.get("verified"),
                metadata_json=fd.get("metadata_json"),
            )
            session.add(finding)
            added_findings.append(finding)
            findings_saved += 1
            sev_key = fd["severity"].value if hasattr(fd["severity"], "value") else fd["severity"]
            severity_counts[sev_key] = severity_counts.get(sev_key, 0) + 1

        session.commit()

        # Compute findings difference
        if not should_skip:
            compute_and_save_findings_diff(session, scan, added_findings)

        _update_progress(session, scan, 90, "Finalizing results...")

        now = datetime.now(timezone.utc)
        scan.status = ScanStatus.COMPLETED
        scan.completed_at = now
        scan.duration_seconds = int((now - scan.started_at).total_seconds())
        scan.progress = 100
        scan.progress_message = "Scan completed"
        scan.summary = {
            "total_findings": findings_saved,
            **severity_counts,
        }
        session.commit()

        logger.info(
            f"Local scan {scan_id} completed: {findings_saved} findings "
            f"({severity_counts})"
        )

        return {
            "status": "completed",
            "scan_id": scan_id,
            "findings_count": findings_saved,
            "severity_counts": severity_counts,
        }

    except Exception as e:
        logger.error(f"Local scan {scan_id} failed: {e}", exc_info=True)
        try:
            scan = session.query(Scan).filter(Scan.id == scan_id).first()
            if scan:
                scan.status = ScanStatus.FAILED
                scan.progress = 100
                scan.progress_message = "Scan failed"
                scan.error_message = str(e)[:2000]
                scan.completed_at = datetime.now(timezone.utc)
                if scan.started_at:
                    scan.duration_seconds = int(
                        (scan.completed_at - scan.started_at).total_seconds()
                    )
                session.commit()
        except Exception:
            session.rollback()
        return {"status": "failed", "error": str(e)}

    finally:
        session.close()
        # Cleanup the workspace parent directory
        try:
            import shutil
            from pathlib import Path
            src_path = Path(source_path)
            # Only clean up if it's not a persistent project directory
            if "projects" not in src_path.parts and src_path.parent.exists():
                shutil.rmtree(src_path.parent)
                logger.info(f"Cleaned up local scan workspace: {src_path.parent}")
        except Exception:
            pass


@celery_app.task(bind=True, name="workers.tasks.run_local_folder_scan")
def run_local_folder_scan(self, scan_id: str, scan_type: str, source_path: str):
    """
    Execute a security scan directly on a local folder path on the host filesystem.
    No extraction, copy, or cleanup is done since we scan in-place.

    Args:
        scan_id: UUID of the Scan record
        scan_type: Type of scan (sast, vulnerability, secret)
        source_path: Path to the local directory on the host machine
    """
    session = SyncSession()

    try:
        scan = session.query(Scan).filter(Scan.id == scan_id).first()
        if not scan:
            logger.error(f"Scan {scan_id} not found")
            return {"status": "error", "message": "Scan not found"}

        scan.status = ScanStatus.RUNNING
        scan.started_at = datetime.now(timezone.utc)
        scan.progress = 10
        scan.progress_message = "Initializing folder scan..."
        session.commit()

        # Check for rescan optimization
        should_skip, prev_finding_dicts = handle_rescan_optimization(session, scan, source_path, scan_type)

        if should_skip:
            _update_progress(session, scan, 60, "Restoring findings from identical previous scan...")
            finding_dicts = prev_finding_dicts
        else:
            _update_progress(session, scan, 30, f"Running {scan_type} analysis on folder...")
            logger.info(f"Executing {scan_type} folder scan on {source_path}")
            finding_dicts = ScanService.execute_scan(scan_type, source_path)

        _update_progress(session, scan, 70, "Processing findings...")

        findings_saved = 0
        severity_counts = {}
        added_findings = []

        for fd in finding_dicts:
            finding = Finding(
                scan_id=scan.id,
                severity=fd["severity"],
                title=fd["title"],
                description=fd.get("description"),
                file_path=fd.get("file_path"),
                line_start=fd.get("line_start"),
                line_end=fd.get("line_end"),
                code_snippet=fd.get("code_snippet"),
                rule_id=fd.get("rule_id"),
                cve_id=fd.get("cve_id"),
                cvss_score=fd.get("cvss_score"),
                package_name=fd.get("package_name"),
                package_version=fd.get("package_version"),
                fixed_version=fd.get("fixed_version"),
                detector_type=fd.get("detector_type"),
                verified=fd.get("verified"),
                metadata_json=fd.get("metadata_json"),
            )
            session.add(finding)
            added_findings.append(finding)
            findings_saved += 1
            sev_key = fd["severity"].value if hasattr(fd["severity"], "value") else fd["severity"]
            severity_counts[sev_key] = severity_counts.get(sev_key, 0) + 1

        session.commit()

        # Compute findings difference
        if not should_skip:
            compute_and_save_findings_diff(session, scan, added_findings)

        _update_progress(session, scan, 90, "Finalizing results...")

        now = datetime.now(timezone.utc)
        scan.status = ScanStatus.COMPLETED
        scan.completed_at = now
        scan.duration_seconds = int((now - scan.started_at).total_seconds())
        scan.progress = 100
        scan.progress_message = "Scan completed"
        scan.summary = {
            "total_findings": findings_saved,
            **severity_counts,
        }
        session.commit()

        logger.info(
            f"Folder scan {scan_id} completed: {findings_saved} findings "
            f"({severity_counts})"
        )

        return {
            "status": "completed",
            "scan_id": scan_id,
            "findings_count": findings_saved,
            "severity_counts": severity_counts,
        }

    except Exception as e:
        logger.error(f"Folder scan {scan_id} failed: {e}", exc_info=True)
        try:
            scan = session.query(Scan).filter(Scan.id == scan_id).first()
            if scan:
                scan.status = ScanStatus.FAILED
                scan.progress = 100
                scan.progress_message = "Scan failed"
                scan.error_message = str(e)[:2000]
                scan.completed_at = datetime.now(timezone.utc)
                if scan.started_at:
                    scan.duration_seconds = int(
                        (scan.completed_at - scan.started_at).total_seconds()
                    )
                session.commit()
        except Exception:
            session.rollback()
        return {"status": "failed", "error": str(e)}

    finally:
        session.close()
