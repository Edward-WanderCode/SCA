"""Project management API routes."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from db.session import get_db
from models.project import Project
from models.scan import Scan
from models.user import User
from schemas.project import (
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    ProjectListResponse,
)
from schemas.scan import ScanResponse
from api.deps import get_current_active_user, require_admin
import json
from core.cache import redis_client, invalidate_cache, clear_all_api_caches

router = APIRouter()


async def _get_project_findings(db: AsyncSession, project_id: str) -> tuple[dict, dict | None]:
    """Get active findings summary and dynamic diff for a project."""
    from models.scan import ScanStatus
    
    # Subquery using ROW_NUMBER() to get the latest completed scan per scan_type
    rn_subq = (
        select(
            Scan.id.label("scan_id"),
            func.row_number().over(
                partition_by=Scan.scan_type,
                order_by=[desc(Scan.completed_at), desc(Scan.created_at)]
            ).label("rn")
        )
        .where(Scan.project_id == project_id, Scan.status == ScanStatus.COMPLETED)
        .subquery()
    )
    
    # Query to get the latest completed scan records
    latest_scans_q = (
        select(Scan)
        .where(Scan.id.in_(select(rn_subq.c.scan_id).where(rn_subq.c.rn == 1)))
    )
    latest_scans_result = await db.execute(latest_scans_q)
    latest_scans = latest_scans_result.scalars().all()
    
    # Sum summaries
    findings = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    findings_diff = {"added": 0, "removed": 0, "unmodified": 0}
    has_diff = False
    
    for s in latest_scans:
        if s.summary:
            for k in findings.keys():
                findings[k] += s.summary.get(k, 0)
        if s.findings_diff:
            has_diff = True
            findings_diff["added"] += s.findings_diff.get("added", 0)
            findings_diff["removed"] += s.findings_diff.get("removed", 0)
            findings_diff["unmodified"] += s.findings_diff.get("unmodified", 0)
            
    return findings, (findings_diff if has_diff else None)


@router.get("", response_model=ProjectListResponse)
async def list_projects(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List all projects with pagination."""
    cache_key = f"projects:list:{page}:{page_size}:{search or ''}"
    cached = await redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    query = select(Project)

    if search:
        query = query.where(Project.name.ilike(f"%{search}%"))

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Fetch page
    query = query.order_by(desc(Project.updated_at))
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    projects = result.scalars().all()

    # Enrich with scan counts
    items = []
    for project in projects:
        scan_count_q = select(func.count()).where(Scan.project_id == project.id)
        scan_count = (await db.execute(scan_count_q)).scalar() or 0

        last_scan_q = (
            select(Scan.created_at)
            .where(Scan.project_id == project.id)
            .order_by(desc(Scan.created_at))
            .limit(1)
        )
        last_scan_at = (await db.execute(last_scan_q)).scalar()

        findings, findings_diff = await _get_project_findings(db, project.id)

        items.append(
            ProjectResponse(
                id=project.id,
                name=project.name,
                repo_url=project.repo_url,
                description=project.description,
                branch=project.branch,
                language=project.language,
                cron_schedule=project.cron_schedule,
                enabled_scanners=project.enabled_scanners,
                created_at=project.created_at,
                updated_at=project.updated_at,
                total_scans=scan_count,
                last_scan_at=last_scan_at,
                findings=findings,
                findings_diff=findings_diff,
            )
        )

    result = ProjectListResponse(
        items=items, total=total, page=page, page_size=page_size
    )
    # Cache for 5 minutes
    await redis_client.setex(cache_key, 300, result.model_dump_json())
    return result


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(
    data: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Create a new project."""
    project = Project(
        name=data.name,
        repo_url=data.repo_url,
        description=data.description,
        branch=data.branch,
        language=data.language,
        cron_schedule=data.cron_schedule,
        enabled_scanners=data.enabled_scanners,
    )
    db.add(project)
    await db.flush()
    await db.refresh(project)
    
    await clear_all_api_caches()

    return ProjectResponse(
        id=project.id,
        name=project.name,
        repo_url=project.repo_url,
        description=project.description,
        branch=project.branch,
        language=project.language,
        cron_schedule=project.cron_schedule,
        enabled_scanners=project.enabled_scanners,
        created_at=project.created_at,
        updated_at=project.updated_at,
        total_scans=0,
        last_scan_at=None,
    )


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get a single project by ID."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    scan_count_q = select(func.count()).where(Scan.project_id == project.id)
    scan_count = (await db.execute(scan_count_q)).scalar() or 0

    last_scan_q = (
        select(Scan.created_at)
        .where(Scan.project_id == project.id)
        .order_by(desc(Scan.created_at))
        .limit(1)
    )
    last_scan_at = (await db.execute(last_scan_q)).scalar()

    findings, findings_diff = await _get_project_findings(db, project.id)

    return ProjectResponse(
        id=project.id,
        name=project.name,
        repo_url=project.repo_url,
        description=project.description,
        branch=project.branch,
        language=project.language,
        cron_schedule=project.cron_schedule,
        enabled_scanners=project.enabled_scanners,
        created_at=project.created_at,
        updated_at=project.updated_at,
        total_scans=scan_count,
        last_scan_at=last_scan_at,
        findings=findings,
        findings_diff=findings_diff,
    )


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    data: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Update a project."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(project, field, value)

    await db.flush()
    await db.refresh(project)
    
    await invalidate_cache("projects:list")

    return ProjectResponse(
        id=project.id,
        name=project.name,
        repo_url=project.repo_url,
        description=project.description,
        branch=project.branch,
        language=project.language,
        cron_schedule=project.cron_schedule,
        enabled_scanners=project.enabled_scanners,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )
@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Delete a project and all its scans."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Explicitly delete associated findings and scans to avoid constraint errors
    from models.scan import Scan
    from models.finding import Finding
    from sqlalchemy import delete
    
    scan_ids_q = select(Scan.id).where(Scan.project_id == project_id)
    scan_ids_result = await db.execute(scan_ids_q)
    scan_ids = scan_ids_result.scalars().all()
    
    if scan_ids:
        await db.execute(delete(Finding).where(Finding.scan_id.in_(scan_ids)))
        await db.execute(delete(Scan).where(Scan.id.in_(scan_ids)))

    # Clean up project folder from workspace if it exists
    try:
        import shutil
        from pathlib import Path
        from config import settings
        project_dir = Path(settings.SCAN_WORKSPACE_DIR) / "projects" / project_id
        if project_dir.exists():
            shutil.rmtree(project_dir)
    except Exception:
        pass

    await db.delete(project)
    await db.commit()
    
    await clear_all_api_caches()


@router.post("/{project_id}/rescan", response_model=list[ScanResponse], status_code=201)
async def rescan_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Trigger a rescan for all scan types previously run on this project."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    from models.scan import ScanStatus, ScanType
    from schemas.scan import ScanResponse
    
    # Rescans are always combined scans
    scan_types = [ScanType.COMBINED]
        
    created_scans_data = []
    
    if project.repo_url.startswith("folder://"):
        path_str = project.repo_url[len("folder://"):]
        for scan_type in scan_types:
            scan = Scan(
                project_id=project_id,
                scan_type=scan_type,
                status=ScanStatus.PENDING,
            )
            db.add(scan)
            await db.flush()
            await db.refresh(scan)
            created_scans_data.append((scan, scan_type))
            
        await db.commit()
        
        for scan, scan_type in created_scans_data:
            try:
                from workers.tasks import run_local_folder_scan
                task = run_local_folder_scan.delay(scan.id, scan_type.value, path_str)
                scan.celery_task_id = task.id
                db.add(scan)
            except Exception:
                pass
        await db.commit()
        
    elif project.repo_url.startswith("local://"):
        from pathlib import Path
        from config import settings
        path_str = f"/app/workspace/projects/{project.id}/src"
        if not Path(path_str).exists():
            raise HTTPException(
                status_code=400,
                detail="Cannot rescan: project source files not found."
            )
            
        for scan_type in scan_types:
            scan = Scan(
                project_id=project_id,
                scan_type=scan_type,
                status=ScanStatus.PENDING,
            )
            db.add(scan)
            await db.flush()
            await db.refresh(scan)
            created_scans_data.append((scan, scan_type))
            
        await db.commit()
        
        for scan, scan_type in created_scans_data:
            try:
                from workers.tasks import run_local_scan
                task = run_local_scan.delay(scan.id, scan_type.value, path_str)
                scan.celery_task_id = task.id
                db.add(scan)
            except Exception:
                pass
        await db.commit()
        
    else:
        for scan_type in scan_types:
            scan = Scan(
                project_id=project_id,
                scan_type=scan_type,
                status=ScanStatus.PENDING,
            )
            db.add(scan)
            await db.flush()
            await db.refresh(scan)
            created_scans_data.append((scan, scan_type))
            
        await db.commit()
        
        for scan, scan_type in created_scans_data:
            try:
                from workers.tasks import run_scan
                task = run_scan.delay(scan.id, scan_type.value)
                scan.celery_task_id = task.id
                db.add(scan)
            except Exception:
                pass
        await db.commit()
        
    created_scans = []
    for scan, scan_type in created_scans_data:
        created_scans.append(
            ScanResponse(
                id=scan.id,
                project_id=scan.project_id,
                project_name=project.name,
                scan_type=scan.scan_type,
                status=scan.status,
                progress=0,
                progress_message=None,
                celery_task_id=scan.celery_task_id,
                started_at=scan.started_at,
                completed_at=scan.completed_at,
                duration_seconds=scan.duration_seconds,
                error_message=scan.error_message,
                summary=None,
                created_at=scan.created_at,
            )
        )
    return created_scans

from schemas.webhook import WebhookConfigResponse, WebhookGenerateRequest
import secrets
from config import settings

@router.get("/{project_id}/webhook-config", response_model=WebhookConfigResponse)
async def get_webhook_config(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get the webhook configuration for a project."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    if not project.webhook_secret:
        raise HTTPException(status_code=404, detail="Webhook not configured for this project")
        
    provider = project.provider or "github"
    base_url = "http://localhost:8000" # In production, this should be the public URL
    webhook_url = f"{base_url}/api/webhooks/{provider}/{project_id}"
    
    return WebhookConfigResponse(
        webhook_url=webhook_url,
        webhook_secret=project.webhook_secret,
        provider=project.provider
    )

@router.post("/{project_id}/webhook-config", response_model=WebhookConfigResponse)
async def generate_webhook_config(
    project_id: str,
    data: WebhookGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Generate a new webhook secret for a project."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    if data.provider not in ["github", "gitlab"]:
        raise HTTPException(status_code=400, detail="Invalid provider. Must be 'github' or 'gitlab'.")
        
    project.webhook_secret = secrets.token_urlsafe(32)
    project.provider = data.provider
    
    await db.commit()
    
    base_url = "http://localhost:8000" # In production, this should be the public URL
    webhook_url = f"{base_url}/api/webhooks/{data.provider}/{project_id}"
    
    return WebhookConfigResponse(
        webhook_url=webhook_url,
        webhook_secret=project.webhook_secret,
        provider=project.provider
    )


