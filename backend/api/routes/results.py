"""Findings/Results API routes."""

import datetime
import json

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, or_, case

from db.session import get_db
from models.finding import Finding, Severity
from models.scan import Scan, ScanStatus
from models.user import User
from schemas.finding import FindingResponse, FindingListResponse, FindingUpdateStatus
from api.deps import get_current_active_user
from core.cache import redis_client, clear_all_api_caches

router = APIRouter()


# ──────────────────────────────────────────────────────────────
# Shared helpers (extracted from 3+ copy-paste occurrences)
# ──────────────────────────────────────────────────────────────

def _build_finding_response(f: Finding, is_new: bool = False) -> FindingResponse:
    """Build a FindingResponse DTO from a Finding ORM object."""
    return FindingResponse(
        id=f.id,
        scan_id=f.scan_id,
        severity=f.severity,
        title=f.title,
        description=f.description,
        file_path=f.file_path,
        line_start=f.line_start,
        line_end=f.line_end,
        code_snippet=f.code_snippet,
        rule_id=f.rule_id,
        cve_id=f.cve_id,
        cvss_score=f.cvss_score,
        package_name=f.package_name,
        package_version=f.package_version,
        fixed_version=f.fixed_version,
        detector_type=f.detector_type,
        verified=f.verified,
        metadata_json=f.metadata_json,
        status=f.status,
        is_new=is_new,
        created_at=f.created_at,
    )


def _get_latest_scan_subquery(project_id: str | None = None):
    """Build subquery for latest completed scan per (project, scan_type)."""
    rn_subq = (
        select(
            Scan.id.label("scan_id"),
            func.row_number()
            .over(
                partition_by=[Scan.project_id, Scan.scan_type],
                order_by=[desc(Scan.completed_at), desc(Scan.created_at)],
            )
            .label("rn"),
        )
        .where(Scan.status == ScanStatus.COMPLETED)
    )
    if project_id:
        rn_subq = rn_subq.where(Scan.project_id == project_id)

    rn_subq_s = rn_subq.subquery()
    return select(rn_subq_s.c.scan_id).where(rn_subq_s.c.rn == 1)


SEVERITY_ORDER = case(
    (Finding.severity == Severity.CRITICAL, 0),
    (Finding.severity == Severity.HIGH, 1),
    (Finding.severity == Severity.MEDIUM, 2),
    (Finding.severity == Severity.LOW, 3),
    else_=4,
)


def _get_severity_label(f: Finding) -> str:
    return f.severity.value.upper() if hasattr(f.severity, "value") else str(f.severity).upper()


def _get_severity_key(f: Finding) -> str:
    return f.severity.value.lower() if hasattr(f.severity, "value") else str(f.severity).lower()


# ──────────────────────────────────────────────────────────────
# API Routes
# ──────────────────────────────────────────────────────────────

@router.get("", response_model=FindingListResponse)
async def list_findings(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    scan_id: str | None = None,
    project_id: str | None = None,
    severity: Severity | None = None,
    file_path: str | None = None,
    rule_id: str | None = None,
    cve_id: str | None = None,
    verified: bool | None = None,
    status: str | None = None,
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List findings with filters and pagination."""
    cache_key = f"findings:list:{page}:{page_size}:{scan_id or ''}:{project_id or ''}:{severity or ''}:{file_path or ''}:{rule_id or ''}:{cve_id or ''}:{verified or ''}:{status or ''}:{search or ''}"
    cached = await redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    query = select(Finding)

    if scan_id:
        query = query.where(Finding.scan_id == scan_id)
    else:
        latest_scan_ids_q = _get_latest_scan_subquery(project_id)
        query = query.where(Finding.scan_id.in_(latest_scan_ids_q))

    if severity:
        query = query.where(Finding.severity == severity)
    if file_path:
        query = query.where(Finding.file_path.ilike(f"%{file_path}%"))
    if rule_id:
        query = query.where(Finding.rule_id == rule_id)
    if cve_id:
        query = query.where(Finding.cve_id == cve_id)
    if verified is not None:
        query = query.where(Finding.verified == verified)
    if status:
        query = query.where(Finding.status == status)
    if search:
        query = query.where(
            or_(Finding.title.ilike(f"%{search}%"), Finding.description.ilike(f"%{search}%"))
        )

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(SEVERITY_ORDER, desc(Finding.created_at))
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    findings = result.scalars().all()

    # Determine which findings are NEW compared to their scan's baseline
    new_ids = set()
    if findings:
        scan_ids = {f.scan_id for f in findings if f.scan_id}
        for s_id in scan_ids:
            s_res = await db.execute(select(Scan).where(Scan.id == s_id))
            scan_obj = s_res.scalar_one_or_none()
            if not scan_obj or not scan_obj.project_id:
                continue

            prev_s_res = await db.execute(
                select(Scan)
                .where(
                    Scan.project_id == scan_obj.project_id,
                    Scan.scan_type == scan_obj.scan_type,
                    Scan.status == ScanStatus.COMPLETED,
                    Scan.id != scan_obj.id,
                    Scan.created_at < scan_obj.created_at,
                )
                .order_by(desc(Scan.completed_at), desc(Scan.created_at))
            )
            prev_scan_obj = prev_s_res.scalars().first()

            scan_findings = [f for f in findings if f.scan_id == s_id]

            if not prev_scan_obj:
                for f in scan_findings:
                    new_ids.add(f.id)
            else:
                prev_f_res = await db.execute(select(Finding).where(Finding.scan_id == prev_scan_obj.id))
                prev_findings_list = prev_f_res.scalars().all()
                prev_keys = {
                    (pf.file_path or "", pf.line_start or 0, pf.rule_id or "", pf.title or "")
                    for pf in prev_findings_list
                }
                for f in scan_findings:
                    if f.metadata_json and isinstance(f.metadata_json, dict) and f.metadata_json.get("is_new") is True:
                        new_ids.add(f.id)
                    else:
                        sig = (f.file_path or "", f.line_start or 0, f.rule_id or "", f.title or "")
                        if sig not in prev_keys:
                            new_ids.add(f.id)

    items = [
        _build_finding_response(
            f,
            is_new=(f.id in new_ids or (f.metadata_json and f.metadata_json.get("is_new") is True)),
        )
        for f in findings
    ]

    result_response = FindingListResponse(items=items, total=total, page=page, page_size=page_size)
    await redis_client.setex(cache_key, 300, result_response.model_dump_json())
    return result_response


@router.get("/export")
async def export_findings_report(
    project_id: str | None = None,
    severity: Severity | None = None,
    format: str = Query("markdown", enum=["markdown", "html", "json"]),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Export active findings report as Markdown, HTML, or JSON."""
    query = select(Finding)
    latest_scan_ids_q = _get_latest_scan_subquery(project_id)
    query = query.where(Finding.scan_id.in_(latest_scan_ids_q))

    if severity:
        query = query.where(Finding.severity == severity)

    query = query.order_by(SEVERITY_ORDER, desc(Finding.created_at))
    result = await db.execute(query)
    findings = result.scalars().all()

    # Resolve project info
    project_name = "Global Report"
    repo_url = "N/A"
    branch = "N/A"
    if project_id:
        from models.project import Project
        proj_res = await db.execute(select(Project).where(Project.id == project_id))
        project = proj_res.scalar_one_or_none()
        if project:
            project_name = project.name
            repo_url = project.repo_url
            branch = project.branch

    total_count = len(findings)
    severity_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    for f in findings:
        sev = _get_severity_key(f)
        if sev in severity_counts:
            severity_counts[sev] += 1

    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    ts_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_project = project_name.lower().replace(" ", "_")

    if format == "markdown":
        content = _render_markdown_report(findings, project_name, repo_url, branch, now_str, severity_counts, total_count)
        return Response(
            content=content, media_type="text/markdown",
            headers={"Content-Disposition": f"attachment; filename=sca_report_{safe_project}_{ts_str}.md"},
        )
    elif format == "html":
        content = _render_html_report(findings, project_name, repo_url, branch, now_str, severity_counts, total_count)
        return Response(
            content=content, media_type="text/html",
            headers={"Content-Disposition": f"attachment; filename=sca_report_{safe_project}_{ts_str}.html"},
        )
    elif format == "json":
        findings_dicts = [
            {
                "id": f.id, "scan_id": f.scan_id,
                "severity": f.severity.value if hasattr(f.severity, "value") else str(f.severity),
                "title": f.title, "description": f.description,
                "file_path": f.file_path, "line_start": f.line_start, "line_end": f.line_end,
                "code_snippet": f.code_snippet, "rule_id": f.rule_id,
                "cve_id": f.cve_id, "cvss_score": f.cvss_score,
                "package_name": f.package_name, "package_version": f.package_version,
                "fixed_version": f.fixed_version, "detector_type": f.detector_type,
                "verified": f.verified,
                "created_at": f.created_at.isoformat() if hasattr(f.created_at, "isoformat") else str(f.created_at),
            }
            for f in findings
        ]

        json_content = json.dumps({
            "project_name": project_name, "repo_url": repo_url, "branch": branch,
            "exported_at": now_str, "summary": severity_counts, "findings": findings_dicts,
        }, indent=2)
        return Response(
            content=json_content, media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename=sca_report_{safe_project}_{ts_str}.json"},
        )


@router.get("/{finding_id}", response_model=FindingResponse)
async def get_finding(
    finding_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get a single finding by ID."""
    result = await db.execute(select(Finding).where(Finding.id == finding_id))
    finding = result.scalar_one_or_none()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")
    return _build_finding_response(finding)


@router.put("/{finding_id}/status", response_model=FindingResponse)
async def update_finding_status(
    finding_id: str,
    status_update: FindingUpdateStatus,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Update finding status (open, ignored, resolved)."""
    if status_update.status not in ["open", "ignored", "resolved"]:
        raise HTTPException(status_code=400, detail="Invalid status. Must be 'open', 'ignored', or 'resolved'.")

    result = await db.execute(select(Finding).where(Finding.id == finding_id))
    finding = result.scalar_one_or_none()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")

    finding.status = status_update.status
    await db.commit()
    await db.refresh(finding)
    await clear_all_api_caches()

    return _build_finding_response(finding)


# ──────────────────────────────────────────────────────────────
# Report rendering helpers
# ──────────────────────────────────────────────────────────────

def _render_markdown_report(findings, project_name, repo_url, branch, now_str, severity_counts, total_count) -> str:
    """Render findings as a Markdown report."""
    md = f"# Security Scan Report: {project_name}\n"
    md += f"- **Export Date:** {now_str}\n"
    md += f"- **Repository:** {repo_url}\n"
    md += f"- **Branch:** {branch}\n\n"

    md += "## Summary\n"
    for sev in ("critical", "high", "medium", "low", "info"):
        md += f"- **{sev.capitalize()}:** {severity_counts[sev]}\n"
    md += f"- **Total Findings:** {total_count}\n\n"

    md += "## Findings Details\n\n"

    if not findings:
        md += "*No active findings found.*\n"
        return md

    for idx, f in enumerate(findings, 1):
        sev_label = _get_severity_label(f)
        md += f"### {idx}. [{sev_label}] {f.title}\n"
        md += f"- **Severity:** {sev_label}\n"
        if f.rule_id:
            md += f"- **Rule ID:** `{f.rule_id}`\n"
        if f.cve_id:
            md += f"- **CVE ID:** `{f.cve_id}`"
            if f.cvss_score:
                md += f" (CVSS: {f.cvss_score})"
            md += "\n"
        if f.package_name:
            md += f"- **Package:** `{f.package_name}@{f.package_version}`"
            if f.fixed_version:
                md += f" (Fixed in: `{f.fixed_version}`)"
            md += "\n"
        if f.file_path:
            location = f.file_path
            if f.line_start:
                location += f":{f.line_start}"
            md += f"- **File Location:** `{location}`\n"

        md += f"\n**Description:**\n{f.description or 'No description provided.'}\n\n"

        if f.code_snippet:
            lang = "code"
            if f.file_path:
                ext = f.file_path.split(".")[-1].lower()
                if ext in ["py", "go", "js", "ts", "tsx", "jsx", "java", "sh", "yml", "yaml", "json"]:
                    lang = ext
            md += f"**Code Snippet:**\n```{lang}\n{f.code_snippet}\n```\n\n"

        if f.fixed_version:
            md += f"**Recommended Fix:**\n"
            md += f"Upgrade `{f.package_name}` from `{f.package_version}` to `{f.fixed_version}`.\n\n"

        md += "---\n\n"

    return md


def _render_html_report(findings, project_name, repo_url, branch, now_str, severity_counts, total_count) -> str:
    """Render findings as a styled HTML report."""
    # CSS styles
    css = """
        :root {
            --bg-primary: #0b0f19; --bg-secondary: #111827; --bg-tertiary: #1f2937;
            --text-primary: #f1f5f9; --text-secondary: #cbd5e1; --text-muted: #94a3b8;
            --border-color: rgba(71, 85, 105, 0.2);
            --critical: #ef4444; --high: #f97316; --medium: #eab308; --low: #3b82f6; --info: #6b7280;
        }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
               background-color: var(--bg-primary); color: var(--text-primary); margin: 0; padding: 40px 20px; line-height: 1.5; }
        .container { max-width: 1000px; margin: 0 auto; }
        .header { border-bottom: 1px solid var(--border-color); padding-bottom: 24px; margin-bottom: 32px; }
        h1 { font-size: 28px; font-weight: 700; margin: 0 0 8px 0; }
        .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-top: 16px; }
        .meta-item { font-size: 14px; color: var(--text-muted); }
        .meta-item strong { color: var(--text-secondary); }
        .summary-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; margin-bottom: 40px; }
        @media (max-width: 640px) { .summary-grid { grid-template-columns: repeat(2, 1fr); } }
        .summary-card { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 10px;
                        padding: 20px 16px; text-align: center; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
        .summary-card.critical { border-left: 4px solid var(--critical); }
        .summary-card.high { border-left: 4px solid var(--high); }
        .summary-card.medium { border-left: 4px solid var(--medium); }
        .summary-card.low { border-left: 4px solid var(--low); }
        .summary-card.info { border-left: 4px solid var(--info); }
        .summary-count { font-size: 32px; font-weight: 700; line-height: 1; margin-bottom: 6px; }
        .summary-card.critical .summary-count { color: var(--critical); }
        .summary-card.high .summary-count { color: var(--high); }
        .summary-card.medium .summary-count { color: var(--medium); }
        .summary-card.low .summary-count { color: var(--low); }
        .summary-card.info .summary-count { color: var(--info); }
        .summary-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
        .findings-title-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;
                              border-bottom: 1px solid var(--border-color); padding-bottom: 12px; }
        .findings-title { font-size: 20px; font-weight: 600; margin: 0; }
        .findings-count { font-size: 14px; color: var(--text-muted); }
        .finding-card { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 12px;
                        padding: 24px; margin-bottom: 20px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
        .finding-card.critical { border-left: 4px solid var(--critical); }
        .finding-card.high { border-left: 4px solid var(--high); }
        .finding-card.medium { border-left: 4px solid var(--medium); }
        .finding-card.low { border-left: 4px solid var(--low); }
        .finding-card.info { border-left: 4px solid var(--info); }
        .finding-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
        .finding-title { font-size: 16px; font-weight: 600; margin: 0; color: #ffffff; line-height: 1.4; }
        .badge { display: inline-block; font-size: 10px; font-weight: 700; padding: 4px 8px; border-radius: 6px;
                 text-transform: uppercase; letter-spacing: 0.02em; }
        .badge.critical { background: rgba(239, 68, 68, 0.12); color: var(--critical); border: 1px solid rgba(239, 68, 68, 0.2); }
        .badge.high { background: rgba(249, 115, 22, 0.12); color: var(--high); border: 1px solid rgba(249, 115, 22, 0.2); }
        .badge.medium { background: rgba(234, 179, 8, 0.12); color: var(--medium); border: 1px solid rgba(234, 179, 8, 0.2); }
        .badge.low { background: rgba(59, 130, 246, 0.12); color: var(--low); border: 1px solid rgba(59, 130, 246, 0.2); }
        .badge.info { background: rgba(107, 114, 128, 0.12); color: var(--info); border: 1px solid rgba(107, 114, 128, 0.2); }
        .finding-meta { display: flex; flex-wrap: wrap; gap: 16px; font-size: 13px; color: var(--text-muted);
                        margin-bottom: 16px; border-bottom: 1px dashed var(--border-color); padding-bottom: 12px; }
        .finding-meta-item { display: flex; align-items: center; gap: 6px; }
        .finding-description { font-size: 14px; color: var(--text-secondary); line-height: 1.6; margin-bottom: 16px; }
        .code-block { background: #030712; border: 1px solid var(--border-color); border-radius: 8px; padding: 16px;
                      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;
                      font-size: 13px; overflow-x: auto; color: #e2e8f0; margin-bottom: 16px; }
        .code-line { color: #ef4444; }
        .fix-box { background: rgba(16, 185, 129, 0.06); border: 1px solid rgba(16, 185, 129, 0.15);
                   border-radius: 8px; padding: 14px 16px; font-size: 13px; color: var(--text-secondary); }
        .fix-title { font-weight: 700; color: #10b981; margin-bottom: 4px; text-transform: uppercase;
                     font-size: 11px; letter-spacing: 0.05em; }
        .no-findings { text-align: center; padding: 48px; color: var(--text-muted); background: var(--bg-secondary);
                       border: 1px solid var(--border-color); border-radius: 12px; }
    """

    # Build summary cards
    summary_cards = ""
    for sev in ("critical", "high", "medium", "low", "info"):
        summary_cards += f"""
            <div class="summary-card {sev}">
                <div class="summary-count">{severity_counts[sev]}</div>
                <div class="summary-label">{sev.capitalize()}</div>
            </div>"""

    # Build finding cards
    finding_cards = ""
    if not findings:
        finding_cards = """
        <div class="no-findings">
            <h3>No active findings found</h3>
            <p>Your codebase is clean!</p>
        </div>"""
    else:
        for idx, f in enumerate(findings, 1):
            sev_key = _get_severity_key(f)
            sev_label = _get_severity_label(f)

            meta_items = ""
            if f.rule_id:
                meta_items += f'<div class="finding-meta-item"><span><strong>Rule:</strong> {f.rule_id}</span></div>\n'
            if f.cve_id:
                cvss_part = f" (CVSS: {f.cvss_score})" if f.cvss_score else ""
                meta_items += f'<div class="finding-meta-item"><span><strong>CVE:</strong> {f.cve_id}{cvss_part}</span></div>\n'
            if f.package_name:
                meta_items += f'<div class="finding-meta-item"><span><strong>Package:</strong> {f.package_name}@{f.package_version}</span></div>\n'
            if f.file_path:
                loc = f.file_path + (f":{f.line_start}" if f.line_start else "")
                meta_items += f'<div class="finding-meta-item"><span><strong>File:</strong> {loc}</span></div>\n'

            code_block = ""
            if f.code_snippet:
                code_block = f'<div class="code-block"><span class="code-line">{f.code_snippet}</span></div>\n'

            fix_block = ""
            if f.fixed_version:
                fix_block = f"""
            <div class="fix-box">
                <div class="fix-title">Recommended Fix</div>
                Upgrade <code>{f.package_name}</code> from <code>{f.package_version}</code> to <code>{f.fixed_version}</code>.
            </div>"""

            finding_cards += f"""
        <div class="finding-card {sev_key}">
            <div class="finding-header">
                <h3 class="finding-title">#{idx}. {f.title}</h3>
                <span class="badge {sev_key}">{sev_label}</span>
            </div>
            <div class="finding-meta">{meta_items}</div>
            <div class="finding-description">{f.description or 'No description provided.'}</div>
            {code_block}{fix_block}
        </div>"""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SCA Security Report - {project_name}</title>
    <style>{css}</style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Security Scan Report</h1>
            <div class="meta-grid">
                <div class="meta-item">Project: <strong>{project_name}</strong></div>
                <div class="meta-item">Exported At: <strong>{now_str}</strong></div>
                <div class="meta-item">Repository: <strong>{repo_url}</strong></div>
                <div class="meta-item">Branch: <strong>{branch}</strong></div>
            </div>
        </div>
        <div class="summary-grid">{summary_cards}</div>
        <div class="findings-title-bar">
            <h2 class="findings-title">Vulnerabilities Details</h2>
            <div class="findings-count">Showing {total_count} active findings</div>
        </div>
        {finding_cards}
    </div>
</body>
</html>"""
