"""Dashboard analytics API routes."""

from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, and_, cast, Date
from db.session import get_db
from models.scan import Scan, ScanStatus, ScanType
from models.finding import Finding, Severity
from models.project import Project

router = APIRouter()


@router.get("/stats")
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
):
    """Get aggregate dashboard statistics."""
    # Total projects
    total_projects = (
        await db.execute(select(func.count()).select_from(Project))
    ).scalar() or 0

    # Total scans
    total_scans = (
        await db.execute(select(func.count()).select_from(Scan))
    ).scalar() or 0

    # Completed scans
    completed_scans = (
        await db.execute(
            select(func.count()).where(Scan.status == ScanStatus.COMPLETED)
        )
    ).scalar() or 0

    # Running scans
    running_scans = (
        await db.execute(
            select(func.count()).where(Scan.status == ScanStatus.RUNNING)
        )
    ).scalar() or 0

    # Total findings
    total_findings = (
        await db.execute(select(func.count()).select_from(Finding))
    ).scalar() or 0

    # Findings by severity
    severity_q = (
        select(Finding.severity, func.count())
        .group_by(Finding.severity)
    )
    severity_result = await db.execute(severity_q)
    severity_counts = dict(severity_result.all())

    # Scans by type
    type_q = (
        select(Scan.scan_type, func.count())
        .group_by(Scan.scan_type)
    )
    type_result = await db.execute(type_q)
    type_counts = {k.value: v for k, v in type_result.all()}

    return {
        "total_projects": total_projects,
        "total_scans": total_scans,
        "completed_scans": completed_scans,
        "running_scans": running_scans,
        "total_findings": total_findings,
        "findings_by_severity": {
            "critical": severity_counts.get(Severity.CRITICAL, 0),
            "high": severity_counts.get(Severity.HIGH, 0),
            "medium": severity_counts.get(Severity.MEDIUM, 0),
            "low": severity_counts.get(Severity.LOW, 0),
            "info": severity_counts.get(Severity.INFO, 0),
        },
        "scans_by_type": {
            "sast": type_counts.get("sast", 0),
            "vulnerability": type_counts.get("vulnerability", 0),
            "secret": type_counts.get("secret", 0),
            "combined": type_counts.get("combined", 0),
        },
    }


@router.get("/trends")
async def get_trends(
    days: int = Query(30, ge=7, le=90),
    db: AsyncSession = Depends(get_db),
):
    """Get finding trends over time."""
    start_date = datetime.now(timezone.utc) - timedelta(days=days)

    # Findings per day
    findings_trend_q = (
        select(
            cast(Finding.created_at, Date).label("date"),
            Finding.severity,
            func.count().label("count"),
        )
        .where(Finding.created_at >= start_date)
        .group_by(cast(Finding.created_at, Date), Finding.severity)
        .order_by(cast(Finding.created_at, Date))
    )
    findings_result = await db.execute(findings_trend_q)

    # Build daily data
    daily_data = {}
    for row in findings_result.all():
        date_str = row.date.isoformat() if hasattr(row.date, 'isoformat') else str(row.date)
        if date_str not in daily_data:
            daily_data[date_str] = {
                "date": date_str,
                "critical": 0,
                "high": 0,
                "medium": 0,
                "low": 0,
                "info": 0,
                "total": 0,
            }
        severity_key = row.severity.value if hasattr(row.severity, 'value') else row.severity
        daily_data[date_str][severity_key] = row.count
        daily_data[date_str]["total"] += row.count

    # Scans per day
    scans_trend_q = (
        select(
            cast(Scan.created_at, Date).label("date"),
            func.count().label("count"),
        )
        .where(Scan.created_at >= start_date)
        .group_by(cast(Scan.created_at, Date))
        .order_by(cast(Scan.created_at, Date))
    )
    scans_result = await db.execute(scans_trend_q)
    scans_by_day = [
        {"date": row.date.isoformat() if hasattr(row.date, 'isoformat') else str(row.date), "count": row.count}
        for row in scans_result.all()
    ]

    return {
        "findings_trend": list(daily_data.values()),
        "scans_trend": scans_by_day,
    }


@router.get("/recent")
async def get_recent_activity(
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Get recent scans and critical findings."""
    # Recent scans
    scans_q = (
        select(Scan, Project.name.label("project_name"))
        .join(Project, Scan.project_id == Project.id)
        .order_by(desc(Scan.created_at))
        .limit(limit)
    )
    scans_result = await db.execute(scans_q)
    recent_scans = []
    for row in scans_result.all():
        scan = row[0]
        project_name = row[1]

        # Get finding count for this scan
        finding_count = (
            await db.execute(
                select(func.count()).where(Finding.scan_id == scan.id)
            )
        ).scalar() or 0

        recent_scans.append({
            "id": scan.id,
            "project_name": project_name,
            "project_id": scan.project_id,
            "scan_type": scan.scan_type.value,
            "status": scan.status.value,
            "findings_count": finding_count,
            "started_at": scan.started_at.isoformat() if scan.started_at else None,
            "completed_at": scan.completed_at.isoformat() if scan.completed_at else None,
            "created_at": scan.created_at.isoformat(),
        })

    # Recent critical/high findings
    critical_q = (
        select(Finding)
        .where(Finding.severity.in_([Severity.CRITICAL, Severity.HIGH]))
        .order_by(desc(Finding.created_at))
        .limit(limit)
    )
    critical_result = await db.execute(critical_q)
    critical_findings = [
        {
            "id": f.id,
            "severity": f.severity.value,
            "title": f.title,
            "file_path": f.file_path,
            "rule_id": f.rule_id,
            "cve_id": f.cve_id,
            "created_at": f.created_at.isoformat(),
        }
        for f in critical_result.scalars().all()
    ]

    return {
        "recent_scans": recent_scans,
        "critical_findings": critical_findings,
    }
