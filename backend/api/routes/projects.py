"""Project management API routes."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from db.session import get_db
from models.project import Project
from models.scan import Scan
from schemas.project import (
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    ProjectListResponse,
)
from schemas.scan import ScanResponse


router = APIRouter()


async def _get_project_findings(db: AsyncSession, project_id: str) -> tuple[dict, dict | None]:
    """Get active findings summary and dynamic diff for a project."""
    from models.scan import ScanStatus
    
    # Subquery to get max completed_at for each scan_type on this project
    subq = (
        select(
            Scan.scan_type,
            func.max(Scan.completed_at).label("max_completed_at")
        )
        .where(Scan.project_id == project_id, Scan.status == ScanStatus.COMPLETED)
        .group_by(Scan.scan_type)
        .subquery()
    )
    
    # Query to get the latest completed scan records
    latest_scans_q = (
        select(Scan)
        .join(
            subq,
            (Scan.scan_type == subq.c.scan_type) &
            (Scan.completed_at == subq.c.max_completed_at)
        )
        .where(Scan.project_id == project_id, Scan.status == ScanStatus.COMPLETED)
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
):
    """List all projects with pagination."""
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
                created_at=project.created_at,
                updated_at=project.updated_at,
                total_scans=scan_count,
                last_scan_at=last_scan_at,
                findings=findings,
                findings_diff=findings_diff,
            )
        )

    return ProjectListResponse(
        items=items, total=total, page=page, page_size=page_size
    )


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(
    data: ProjectCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new project."""
    project = Project(
        name=data.name,
        repo_url=data.repo_url,
        description=data.description,
        branch=data.branch,
        language=data.language,
    )
    db.add(project)
    await db.flush()
    await db.refresh(project)

    return ProjectResponse(
        id=project.id,
        name=project.name,
        repo_url=project.repo_url,
        description=project.description,
        branch=project.branch,
        language=project.language,
        created_at=project.created_at,
        updated_at=project.updated_at,
        total_scans=0,
        last_scan_at=None,
    )


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
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

    return ProjectResponse(
        id=project.id,
        name=project.name,
        repo_url=project.repo_url,
        description=project.description,
        branch=project.branch,
        language=project.language,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )
@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
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


@router.post("/{project_id}/rescan", response_model=list[ScanResponse], status_code=201)
async def rescan_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Trigger a rescan for all scan types previously run on this project."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    from models.scan import ScanStatus, ScanType
    from schemas.scan import ScanResponse
    
    # Get the latest scan types run for this project
    scan_types_q = select(Scan.scan_type).where(Scan.project_id == project_id).distinct()
    scan_types_result = await db.execute(scan_types_q)
    scan_types = scan_types_result.scalars().all()
    
    if not scan_types:
        scan_types = [ScanType.SAST]
        
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

