"""Script to warm up Redis cache for frequently accessed endpoints."""

import asyncio
import json
import logging
import sys
from pathlib import Path

# Add backend dir to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from db.session import AsyncSessionLocal
from sqlalchemy import select, func
from models.project import Project
from models.scan import Scan, ScanStatus
from models.finding import Finding, Severity
from core.cache import redis_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def warm_dashboard_stats():
    """Warms up the dashboard stats cache."""
    cache_key = "dashboard:stats"
    logger.info(f"Warming cache for {cache_key}...")
    
    async with AsyncSessionLocal() as db:
        # Replicate the dashboard stats logic
        total_projects = (await db.execute(select(func.count()).select_from(Project))).scalar() or 0
        total_scans = (await db.execute(select(func.count()).select_from(Scan))).scalar() or 0
        completed_scans = (await db.execute(select(func.count()).where(Scan.status == ScanStatus.COMPLETED))).scalar() or 0
        running_scans = (await db.execute(select(func.count()).where(Scan.status == ScanStatus.RUNNING))).scalar() or 0
        total_findings = (await db.execute(select(func.count()).select_from(Finding))).scalar() or 0
        
        severity_q = select(Finding.severity, func.count()).group_by(Finding.severity)
        severity_counts = dict((await db.execute(severity_q)).all())
        
        type_q = select(Scan.scan_type, func.count()).group_by(Scan.scan_type)
        type_counts = {k.value: v for k, v in (await db.execute(type_q)).all()}
        
        result = {
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
        
        await redis_client.setex(cache_key, 300, json.dumps(result))
        logger.info(f"Successfully warmed cache for {cache_key}")

async def main():
    await warm_dashboard_stats()
    # Can be extended to warm top 10 projects, etc.
    
if __name__ == "__main__":
    asyncio.run(main())
