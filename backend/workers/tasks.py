"""Celery tasks for async scan execution."""

import logging
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from sqlalchemy.orm import Session

from workers.celery_app import celery_app
from workers.db import SyncSession
from config import settings
from models.scan import Scan, ScanStatus
from models.finding import Finding
from models.project import Project
from services.scan_service import ScanService
from utils.scanner_utils import clone_repository, cleanup_workspace
from utils.telegram import (
    send_telegram_notification,
    send_telegram_document,
    escape_html,
    pin_telegram_message,
    unpin_telegram_message,
    create_telegram_topic,
)
from services.webhook_service import post_github_commit_status, post_github_pr_comment
from core.cache import clear_all_api_caches_sync

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────
# Helper: progress update
# ──────────────────────────────────────────────────────────────

def _update_progress(session: Session, scan: Scan, progress: int, message: str):
    """Update scan progress in database."""
    scan.progress = min(progress, 100)
    scan.progress_message = message
    session.commit()
    logger.info(f"Scan {scan.id} progress: {progress}% - {message}")


# ──────────────────────────────────────────────────────────────
# Helper: Telegram topic management
# ──────────────────────────────────────────────────────────────

def _ensure_project_telegram_topic(session: Session, project: Project) -> int | None:
    """Ensure that a project has a Telegram topic thread ID. If not, create one."""
    if project.telegram_topic_id:
        return project.telegram_topic_id

    try:
        clean_topic_name = project.name.replace("Local Folder: ", "").replace("Local: ", "").replace("Telegram: ", "").strip()
        topic_id = create_telegram_topic(clean_topic_name)
        if topic_id:
            project.telegram_topic_id = topic_id
            session.commit()
            return topic_id
    except Exception as e:
        logger.error(f"Failed to ensure Telegram topic for project {project.name}: {e}")
    return None


# ──────────────────────────────────────────────────────────────
# Helper: save findings to DB (was duplicated 3x)
# ──────────────────────────────────────────────────────────────

def _save_findings_to_db(
    session: Session, scan: Scan, finding_dicts: list[dict]
) -> tuple[int, dict, list[Finding]]:
    """Save parsed findings to database. Returns (count, severity_counts, finding_objects)."""
    findings_saved = 0
    severity_counts: dict[str, int] = {}
    added_findings: list[Finding] = []

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
            status=fd.get("status", "open"),
        )
        session.add(finding)
        added_findings.append(finding)
        findings_saved += 1

        sev_key = fd["severity"].value if hasattr(fd["severity"], "value") else fd["severity"]
        severity_counts[sev_key] = severity_counts.get(sev_key, 0) + 1

    session.commit()
    return findings_saved, severity_counts, added_findings


# ──────────────────────────────────────────────────────────────
# Helper: finalize scan as completed (was duplicated 3x)
# ──────────────────────────────────────────────────────────────

def _finalize_scan(
    session: Session,
    scan: Scan,
    findings_saved: int,
    severity_counts: dict,
    extra_summary: dict | None = None,
):
    """Mark scan as completed, build summary, and invalidate caches."""
    now = datetime.now(timezone.utc)
    scan.status = ScanStatus.COMPLETED
    scan.completed_at = now
    scan.duration_seconds = int((now - scan.started_at).total_seconds())
    scan.progress = 100
    scan.progress_message = "Scan completed"

    # Preserve existing summary fields (e.g. "filename") if present
    existing = scan.summary if isinstance(scan.summary, dict) else {}
    scan.summary = {
        **existing,
        "total_findings": findings_saved,
        **severity_counts,
        **(extra_summary or {}),
    }
    session.commit()

    # Invalidate API cache so new findings immediately appear
    clear_all_api_caches_sync()


# ──────────────────────────────────────────────────────────────
# Helper: Telegram notifications (was duplicated 3x)
# ──────────────────────────────────────────────────────────────

def _send_scan_completed_notification(project: Project, scan: Scan, session: Session):
    """Send scan completed notification to Telegram, pin it, and unpin previous result."""
    try:
        summary = scan.summary or {}
        total_findings = summary.get("total_findings", 0)

        critical = summary.get("critical", 0) or summary.get("CRITICAL", 0)
        high = summary.get("high", 0) or summary.get("HIGH", 0)
        medium = summary.get("medium", 0) or summary.get("MEDIUM", 0)
        low = summary.get("low", 0) or summary.get("LOW", 0)
        info = summary.get("info", 0) or summary.get("INFO", 0)

        diff_info = ""
        if scan.findings_diff:
            added = scan.findings_diff.get("added", 0)
            removed = scan.findings_diff.get("removed", 0)
            unmodified = scan.findings_diff.get("unmodified", 0)
            diff_info = f"\n• <b>Thay đổi:</b> +{added} | -{removed} | ={unmodified}"

        filename_str = ""
        if scan.summary and isinstance(scan.summary, dict) and scan.summary.get("filename"):
            filename_str = scan.summary.get("filename")
        elif project.repo_url and "local" in project.repo_url:
            filename_str = project.repo_url.split("://")[-1]

        file_line = f"\n• <b>Tệp quét (ZIP):</b> <code>{escape_html(filename_str)}</code>" if filename_str else ""

        msg = (
            f"✅ <b>[SCA Platform] Quét hoàn thành thành công</b>\n\n"
            f"• <b>Dự án:</b> <b>{escape_html(project.name)}</b>{file_line}\n"
            f"• <b>Loại quét:</b> <code>{scan.scan_type.value.upper()}</code>\n"
            f"• <b>Thời gian quét:</b> <code>{scan.duration_seconds}s</code>\n"
            f"• <b>Tổng số lỗi phát hiện:</b> <b>{total_findings}</b>{diff_info}\n"
            f"  🔴 <i>Critical:</i> {critical}\n"
            f"  🟠 <i>High:</i> {high}\n"
            f"  🟡 <i>Medium:</i> {medium}\n"
            f"  🔵 <i>Low:</i> {low}\n"
            f"  ⚪ <i>Info:</i> {info}"
        )

        inline_keyboard = [
            [
                {"text": "🔄 Quét lại (Rescan)", "callback_data": f"rescan:{project.id}:{scan.scan_type.value}"},
                {"text": "🗑️ Xóa dự án (Delete)", "callback_data": f"delete:{project.id}"},
            ]
        ]

        sent_msg_id = send_telegram_notification(
            msg, message_thread_id=project.telegram_topic_id, inline_keyboard=inline_keyboard
        )

        if sent_msg_id:
            scan.telegram_message_id = sent_msg_id
            session.commit()

            pin_telegram_message(sent_msg_id)

            # Unpin previous result
            prev_scan = (
                session.query(Scan)
                .filter(
                    Scan.project_id == scan.project_id,
                    Scan.status == ScanStatus.COMPLETED,
                    Scan.telegram_message_id.isnot(None),
                    Scan.id != scan.id,
                )
                .order_by(Scan.completed_at.desc())
                .first()
            )
            if prev_scan and prev_scan.telegram_message_id:
                unpin_telegram_message(prev_scan.telegram_message_id)

        # Generate and send HTML report
        try:
            from utils.report_generator import generate_html_report
            import tempfile
            from sqlalchemy import func

            findings = session.query(Finding).filter(Finding.scan_id == scan.id).all()
            html_content = generate_html_report(project, scan, findings)

            scan_count = session.query(func.count(Scan.id)).filter(
                Scan.project_id == project.id,
                Scan.status == ScanStatus.COMPLETED
            ).scalar() or 1

            ts_str = scan.completed_at.strftime("%Y%m%d_%H%M%S") if scan.completed_at else datetime.now().strftime("%Y%m%d_%H%M%S")
            safe_name = "".join([c for c in project.name if c.isalnum() or c in ("-", "_")]).strip()
            if not safe_name:
                safe_name = "Project"

            report_filename = f"{safe_name}_scan{scan_count:02d}_{ts_str}.html"

            temp_path = os.path.join(tempfile.gettempdir(), report_filename)
            with open(temp_path, "w", encoding="utf-8") as f:
                f.write(html_content)

            caption = f"📊 <b>Báo cáo quét chi tiết:</b> <code>{escape_html(project.name)}</code>"
            send_telegram_document(temp_path, caption, message_thread_id=project.telegram_topic_id)

            if os.path.exists(temp_path):
                os.unlink(temp_path)
        except Exception as re:
            logger.error(f"Failed to generate or send HTML report: {re}")

    except Exception as e:
        logger.error(f"Failed to send scan completion notification: {e}")


def _send_scan_failed_notification(project: Project | None, scan: Scan, error_message: str):
    """Send scan failed notification to Telegram."""
    try:
        name = project.name if project else "Unknown"
        thread_id = project.telegram_topic_id if project else None
        msg = (
            f"❌ <b>[SCA Platform] Quét thất bại</b>\n\n"
            f"• <b>Dự án:</b> <b>{escape_html(name)}</b>\n"
            f"• <b>Loại quét:</b> <code>{scan.scan_type.value.upper()}</code>\n"
            f"• <b>Lỗi:</b> <code>{escape_html(error_message)}</code>"
        )

        inline_keyboard = None
        if project:
            inline_keyboard = [
                [
                    {"text": "🔄 Quét lại (Rescan)", "callback_data": f"rescan:{project.id}:{scan.scan_type.value}"},
                    {"text": "🗑️ Xóa dự án (Delete)", "callback_data": f"delete:{project.id}"},
                ]
            ]

        send_telegram_notification(msg, message_thread_id=thread_id, inline_keyboard=inline_keyboard)
    except Exception as e:
        logger.error(f"Failed to send scan failure notification: {e}")



def _send_scan_start_notification(project: Project, scan: Scan, extra_info: str = ""):
    """Send scan started notification to Telegram."""
    try:
        msg = (
            f"🔔 <b>[SCA Platform] Bắt đầu quét dự án</b>\n\n"
            f"• <b>Dự án:</b> <b>{escape_html(project.name)}</b>\n"
            f"{extra_info}"
            f"• <b>Loại quét:</b> <code>{scan.scan_type.value.upper()}</code>\n"
            f"• <b>ID quét:</b> <code>{scan.id}</code>"
        )
        send_telegram_notification(msg, message_thread_id=project.telegram_topic_id)
    except Exception as te:
        logger.error(f"Telegram start notification failed: {te}")


# ──────────────────────────────────────────────────────────────
# Helper: rescan optimization (hash comparison)
# ──────────────────────────────────────────────────────────────

def handle_rescan_optimization(session: Session, scan: Scan, repo_path: str, scan_type: str) -> tuple[bool, list[dict] | None]:
    """Check if we can skip the scan by comparing hashes with the previous completed scan."""
    from utils.scanner_utils import calculate_directory_hashes

    current_hashes = calculate_directory_hashes(repo_path)
    scan.file_hashes = current_hashes
    session.commit()

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

    if current_hashes == prev_scan.file_hashes:
        logger.info(f"File hashes are identical to scan {prev_scan.id}. Skipping analysis!")
        prev_findings = session.query(Finding).filter(Finding.scan_id == prev_scan.id).all()

        finding_dicts = [
            {
                "severity": f.severity, "title": f.title, "description": f.description,
                "file_path": f.file_path, "line_start": f.line_start, "line_end": f.line_end,
                "code_snippet": f.code_snippet, "rule_id": f.rule_id, "cve_id": f.cve_id,
                "cvss_score": f.cvss_score, "package_name": f.package_name,
                "package_version": f.package_version, "fixed_version": f.fixed_version,
                "detector_type": f.detector_type, "verified": f.verified,
                "metadata_json": f.metadata_json,
            }
            for f in prev_findings
        ]

        scan.findings_diff = {"added": 0, "removed": 0, "unmodified": len(prev_findings)}
        session.commit()
        return True, finding_dicts

    return False, None


# ──────────────────────────────────────────────────────────────
# Helper: baseline management
# ──────────────────────────────────────────────────────────────

def _apply_baseline_management(session: Session, project_id: str, finding_dicts: list[dict]):
    """Inherit ignored status from previous scans for baseline management."""
    ignored_findings = (
        session.query(Finding)
        .join(Scan, Finding.scan_id == Scan.id)
        .filter(
            Scan.project_id == project_id,
            Scan.status == ScanStatus.COMPLETED,
            Finding.status == "ignored",
        )
        .all()
    )

    ignored_signatures = {
        (f.rule_id or "", f.file_path or "", f.title or "") for f in ignored_findings
    }

    for fd in finding_dicts:
        sig = (fd.get("rule_id") or "", fd.get("file_path") or "", fd.get("title") or "")
        fd["status"] = "ignored" if sig in ignored_signatures else "open"


# ──────────────────────────────────────────────────────────────
# Helper: combined scan execution
# ──────────────────────────────────────────────────────────────

def _execute_combined_scan(session: Session, scan: Scan, source_path: str, project: Project) -> list[dict]:
    """Execute a combined scan based on project's enabled scanners."""
    finding_dicts: list[dict] = []
    scanners = project.enabled_scanners or ["secret", "vulnerability", "sast"]

    scanner_map = {
        "secret": (30, "Running secret detection...", ScanService.run_secret_scan),
        "vulnerability": (50, "Running dependency vulnerability scan...", ScanService.run_vulnerability_scan),
        "sast": (70, "Running SAST analysis...", ScanService.run_sast_scan),
    }

    for scanner_key in scanners:
        if scanner_key in scanner_map:
            progress, msg, fn = scanner_map[scanner_key]
            _update_progress(session, scan, progress, msg)
            try:
                finding_dicts.extend(fn(source_path))
            except Exception as e:
                logger.error(f"{scanner_key.capitalize()} scan failed: {e}")

    return finding_dicts


# ──────────────────────────────────────────────────────────────
# Helper: findings diff computation
# ──────────────────────────────────────────────────────────────

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
        scan.findings_diff = {"added": len(current_findings), "removed": 0, "unmodified": 0}
        for f in current_findings:
            meta = dict(f.metadata_json or {})
            meta["is_new"] = True
            f.metadata_json = meta
        session.commit()
        return

    prev_findings = session.query(Finding).filter(Finding.scan_id == prev_scan.id).all()

    def get_finding_key(f):
        if isinstance(f, Finding):
            return (f.file_path or "", f.line_start or 0, f.rule_id or "", f.title or "")
        return (f.get("file_path") or "", f.get("line_start") or 0, f.get("rule_id") or "", f.get("title") or "")

    prev_keys = {get_finding_key(f) for f in prev_findings}

    added_count = 0
    for f in current_findings:
        key = get_finding_key(f)
        meta = dict(f.metadata_json or {})
        if key not in prev_keys:
            meta["is_new"] = True
            added_count += 1
        else:
            meta["is_new"] = False
        f.metadata_json = meta

    curr_keys = {get_finding_key(f) for f in current_findings}
    removed_count = len(prev_keys - curr_keys)
    unmodified_count = len(current_findings) - added_count

    scan.findings_diff = {"added": added_count, "removed": removed_count, "unmodified": unmodified_count}
    session.commit()


# ══════════════════════════════════════════════════════════════
# Core pipeline: shared scan execution logic
# ══════════════════════════════════════════════════════════════

def _execute_scan_pipeline(
    scan_id: str,
    scan_type: str,
    get_source_path: Callable[[Session, Scan, Project], str],
    build_start_info: Callable[[Project], str],
    cleanup_fn: Callable[[str, str], None] | None = None,
    webhook_metadata: dict | None = None,
):
    """
    Unified scan execution pipeline used by all 3 Celery task types.

    Args:
        scan_id: UUID of the Scan record
        scan_type: Type of scan (sast, vulnerability, secret, combined)
        get_source_path: Callable that returns the path to source code to scan
        build_start_info: Callable that builds extra info for Telegram start notification
        cleanup_fn: Optional callable(scan_id, source_path) for workspace cleanup
        webhook_metadata: Optional webhook info for GitHub commit status
    """
    session = SyncSession()
    project = None
    source_path = None

    try:
        # 1. Fetch scan record
        scan = session.query(Scan).filter(Scan.id == scan_id).first()
        if not scan:
            logger.error(f"Scan {scan_id} not found")
            return {"status": "error", "message": "Scan not found"}

        # 2. Update status to running
        scan.status = ScanStatus.RUNNING
        scan.started_at = datetime.now(timezone.utc)
        scan.progress = 10
        scan.progress_message = "Initializing scan..."
        session.commit()

        # 3. Get project
        project = session.query(Project).filter(Project.id == scan.project_id).first()
        if not project:
            raise ValueError(f"Project {scan.project_id} not found")

        # 4. Post pending commit status (GitHub webhook)
        if webhook_metadata and webhook_metadata.get("commit_sha") and project.provider == "github":
            post_github_commit_status(
                project.repo_url, webhook_metadata["commit_sha"], "pending", "Scan is running..."
            )

        # 5. Ensure Telegram topic
        _ensure_project_telegram_topic(session, project)

        # 6. Telegram start notification
        extra_info = build_start_info(project)
        _send_scan_start_notification(project, scan, extra_info)

        # 7. Get source path
        _update_progress(session, scan, 20, "Preparing source code...")
        source_path = get_source_path(session, scan, project)

        # 8. Rescan optimization
        should_skip, prev_finding_dicts = handle_rescan_optimization(session, scan, source_path, scan_type)

        if should_skip:
            _update_progress(session, scan, 60, "Restoring findings from identical previous scan...")
            finding_dicts = prev_finding_dicts
        else:
            if scan_type == "combined":
                finding_dicts = _execute_combined_scan(session, scan, source_path, project)
            else:
                _update_progress(session, scan, 40, f"Running {scan_type} analysis...")
                logger.info(f"Executing {scan_type} scan for project {project.name}")
                finding_dicts = ScanService.execute_scan(scan_type, source_path)

        # 9. Process and save findings
        _update_progress(session, scan, 70, "Processing findings...")
        _apply_baseline_management(session, scan.project_id, finding_dicts)
        findings_saved, severity_counts, added_findings = _save_findings_to_db(session, scan, finding_dicts)

        if not should_skip:
            compute_and_save_findings_diff(session, scan, added_findings)

        # 10. Finalize
        _update_progress(session, scan, 90, "Finalizing results...")
        _finalize_scan(session, scan, findings_saved, severity_counts)

        # 11. Telegram success notification
        _send_scan_completed_notification(project, scan, session)

        logger.info(f"Scan {scan_id} completed: {findings_saved} findings ({severity_counts})")

        # 12. Post GitHub commit status & PR comment
        if webhook_metadata and project.provider == "github":
            commit_sha = webhook_metadata.get("commit_sha")
            if commit_sha:
                state = "failure" if findings_saved > 0 else "success"
                desc = f"Found {findings_saved} issues" if findings_saved > 0 else "No issues found"
                post_github_commit_status(project.repo_url, commit_sha, state, desc)

            pr_number = webhook_metadata.get("pr_number")
            if pr_number:
                comment = (
                    f"### 🛡️ SCA Platform Scan Results\n\n"
                    f"**Total Findings:** {findings_saved}\n"
                    f"- 🔴 Critical: {severity_counts.get('critical', 0)}\n"
                    f"- 🟠 High: {severity_counts.get('high', 0)}\n"
                    f"- 🟡 Medium: {severity_counts.get('medium', 0)}\n"
                    f"- 🔵 Low: {severity_counts.get('low', 0)}"
                )
                post_github_pr_comment(project.repo_url, pr_number, comment)

        return {
            "status": "completed",
            "scan_id": scan_id,
            "findings_count": findings_saved,
            "severity_counts": severity_counts,
        }

    except Exception as e:
        logger.error(f"Scan {scan_id} failed: {e}", exc_info=True)

        try:
            scan = session.query(Scan).filter(Scan.id == scan_id).first()
            if scan:
                scan.status = ScanStatus.FAILED
                scan.progress = 100
                scan.progress_message = "Scan failed"
                scan.error_message = str(e)[:2000]
                scan.completed_at = datetime.now(timezone.utc)
                if scan.started_at:
                    scan.duration_seconds = int((scan.completed_at - scan.started_at).total_seconds())
                session.commit()

                _send_scan_failed_notification(project, scan, str(e))

                if webhook_metadata and project and project.provider == "github":
                    commit_sha = webhook_metadata.get("commit_sha")
                    if commit_sha:
                        post_github_commit_status(project.repo_url, commit_sha, "error", "Scan failed to execute")
        except Exception:
            session.rollback()

        return {"status": "failed", "error": str(e)}

    finally:
        session.close()
        if cleanup_fn and source_path:
            try:
                cleanup_fn(str(scan_id), source_path)
            except Exception:
                pass


# ══════════════════════════════════════════════════════════════
# Celery Tasks — thin wrappers around _execute_scan_pipeline
# ══════════════════════════════════════════════════════════════

@celery_app.task(bind=True, name="workers.tasks.run_scan")
def run_scan(self, scan_id: str, scan_type: str, webhook_metadata: dict = None):
    """Execute a security scan on a Git repository asynchronously."""

    def get_source(session, scan, project):
        workspace_name = f"{scan.id}"
        return clone_repository(
            repo_url=project.repo_url, target_dir=workspace_name, branch=project.branch,
        )

    def build_info(project):
        return (
            f"• <b>Repository:</b> {escape_html(project.repo_url)}\n"
            f"• <b>Nhánh:</b> <code>{escape_html(project.branch or 'main')}</code>\n"
        )

    def cleanup(scan_id_str, source_path):
        cleanup_workspace(scan_id_str)

    return _execute_scan_pipeline(
        scan_id=scan_id,
        scan_type=scan_type,
        get_source_path=get_source,
        build_start_info=build_info,
        cleanup_fn=cleanup,
        webhook_metadata=webhook_metadata,
    )


@celery_app.task(bind=True, name="workers.tasks.run_local_scan")
def run_local_scan(self, scan_id: str, scan_type: str, source_path: str):
    """Execute a security scan on a pre-extracted local directory (from ZIP upload)."""

    def get_source(session, scan, project):
        return source_path

    def build_info(project):
        filename_str = ""
        # Try to get filename from scan summary or project repo_url
        # Note: scan is not available here, so we use project info
        if project.repo_url and "local" in project.repo_url:
            filename_str = project.repo_url.split("://")[-1]
        file_line = f"• <b>Tệp quét (ZIP):</b> <code>{escape_html(filename_str)}</code>\n" if filename_str else ""
        return file_line

    def cleanup(scan_id_str, src_path):
        src = Path(src_path)
        if "projects" not in src.parts and src.parent.exists():
            shutil.rmtree(src.parent)
            logger.info(f"Cleaned up local scan workspace: {src.parent}")

    return _execute_scan_pipeline(
        scan_id=scan_id,
        scan_type=scan_type,
        get_source_path=get_source,
        build_start_info=build_info,
        cleanup_fn=cleanup,
    )


@celery_app.task(bind=True, name="workers.tasks.run_local_folder_scan")
def run_local_folder_scan(self, scan_id: str, scan_type: str, source_path: str):
    """Execute a security scan directly on a local folder path on the host filesystem."""

    def get_source(session, scan, project):
        return source_path

    def build_info(project):
        folder_path = project.repo_url.replace("folder://", "")
        return f"• <b>Thư mục:</b> <code>{escape_html(folder_path)}</code>\n"

    # No cleanup for folder scans — we scan in-place
    return _execute_scan_pipeline(
        scan_id=scan_id,
        scan_type=scan_type,
        get_source_path=get_source,
        build_start_info=build_info,
        cleanup_fn=None,
    )
