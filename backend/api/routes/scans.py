"""Scan management API routes."""

import uuid
import shutil
import zipfile
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query, File, UploadFile, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from db.session import get_db
from models.project import Project
from models.scan import Scan, ScanType, ScanStatus
from models.finding import Finding, Severity
from schemas.scan import ScanCreate, ScanResponse, ScanListResponse, ScanSummary, FolderScanCreate
from config import settings

router = APIRouter()


def _build_summary(findings_counts: dict) -> ScanSummary:
    """Build a scan summary from finding severity counts."""
    return ScanSummary(
        total_findings=sum(findings_counts.values()),
        critical=findings_counts.get(Severity.CRITICAL, 0),
        high=findings_counts.get(Severity.HIGH, 0),
        medium=findings_counts.get(Severity.MEDIUM, 0),
        low=findings_counts.get(Severity.LOW, 0),
        info=findings_counts.get(Severity.INFO, 0),
    )


async def _enrich_scan(db: AsyncSession, scan: Scan) -> ScanResponse:
    """Enrich scan with project name and findings summary."""
    project_name = None
    if scan.project_id:
        proj_q = select(Project.name).where(Project.id == scan.project_id)
        project_name = (await db.execute(proj_q)).scalar()

    severity_q = (
        select(Finding.severity, func.count())
        .where(Finding.scan_id == scan.id)
        .group_by(Finding.severity)
    )
    severity_result = await db.execute(severity_q)
    findings_counts = dict(severity_result.all())

    summary = _build_summary(findings_counts) if findings_counts else scan.summary

    return ScanResponse(
        id=scan.id,
        project_id=scan.project_id,
        project_name=project_name,
        scan_type=scan.scan_type,
        status=scan.status,
        progress=scan.progress,
        progress_message=scan.progress_message,
        celery_task_id=scan.celery_task_id,
        started_at=scan.started_at,
        completed_at=scan.completed_at,
        duration_seconds=scan.duration_seconds,
        error_message=scan.error_message,
        summary=summary,
        findings_diff=scan.findings_diff,
        created_at=scan.created_at,
    )


@router.get("", response_model=ScanListResponse)
async def list_scans(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    project_id: str | None = None,
    scan_type: ScanType | None = None,
    status: ScanStatus | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List scans with filters and pagination."""
    query = select(Scan)

    if project_id:
        query = query.where(Scan.project_id == project_id)
    if scan_type:
        query = query.where(Scan.scan_type == scan_type)
    if status:
        query = query.where(Scan.status == status)

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(desc(Scan.created_at))
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    scans = result.scalars().all()

    items = [await _enrich_scan(db, scan) for scan in scans]

    return ScanListResponse(
        items=items, total=total, page=page, page_size=page_size
    )


@router.post("", response_model=list[ScanResponse], status_code=201)
async def create_scan(
    data: ScanCreate,
    db: AsyncSession = Depends(get_db),
):
    """Trigger new scan(s) for a project."""
    result = await db.execute(
        select(Project).where(Project.id == data.project_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.repo_url.startswith("local://") or project.repo_url.startswith("folder://"):
        raise HTTPException(
            status_code=400,
            detail="Cannot run standard git scans on local upload or local folder projects. Please use the appropriate tab to start a new scan."
        )

    # We ignore the individual scan_types requested and always run a combined scan
    scan = Scan(
        project_id=data.project_id,
        scan_type=ScanType.COMBINED,
        status=ScanStatus.PENDING,
    )
    db.add(scan)
    await db.flush()
    await db.refresh(scan)

    # Commit first so the worker can query the Scan records
    await db.commit()

    try:
        from workers.tasks import run_scan
        task = run_scan.delay(scan.id, ScanType.COMBINED.value)
        scan.celery_task_id = task.id
        db.add(scan)
    except Exception:
        pass

    # Commit updates to celery_task_ids
    await db.commit()

    return [
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
    ]


@router.post("/local", response_model=list[ScanResponse], status_code=201)
async def create_local_scan(
    file: UploadFile = File(...),
    scan_types: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    """Scan a local code directory uploaded as a ZIP file."""
    if not file.filename or not file.filename.endswith('.zip'):
        raise HTTPException(status_code=400, detail="Only ZIP files are supported")

    try:
        types = [ScanType(t.strip()) for t in scan_types.split(",")]
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid scan type: {e}")

    # Save ZIP to a temporary file
    temp_zip_id = str(uuid.uuid4())
    temp_zip_path = Path(settings.SCAN_WORKSPACE_DIR) / f"temp_{temp_zip_id}.zip"
    Path(settings.SCAN_WORKSPACE_DIR).mkdir(parents=True, exist_ok=True)

    try:
        content = await file.read()
        with open(temp_zip_path, "wb") as f:
            f.write(content)
    except Exception as e:
        if temp_zip_path.exists():
            temp_zip_path.unlink()
        raise HTTPException(status_code=500, detail=f"Failed to save upload: {e}")

    # Validate ZIP format once
    if not zipfile.is_zipfile(temp_zip_path):
        temp_zip_path.unlink()
        raise HTTPException(status_code=400, detail="Invalid ZIP file structure")

    # Reuse existing project if same repo_url
    repo_url = f"local://{file.filename}"
    project_q = select(Project).where(Project.repo_url == repo_url)
    project_result = await db.execute(project_q)
    project = project_result.scalars().first()
    
    if not project:
        project_name = f"Local: {file.filename.replace('.zip', '')}"
        project = Project(
            name=project_name,
            repo_url=repo_url,
            description="Uploaded via local scan",
            branch="local",
        )
        db.add(project)
        await db.flush()
        await db.refresh(project)
    else:
        project_name = project.name

    scans_data = []
    scan = Scan(
        project_id=project.id,
        scan_type=ScanType.COMBINED,
        status=ScanStatus.PENDING,
    )
    db.add(scan)
    await db.flush()
    await db.refresh(scan)

    # Commit now so worker can see the Scan and Project records
    await db.commit()

    # Now extract files and dispatch Celery tasks
    project_workspace_dir = Path(settings.SCAN_WORKSPACE_DIR) / "projects" / project.id
    project_src_dir = project_workspace_dir / "src"

    # Clean existing directory to ensure fresh code
    if project_src_dir.exists():
        shutil.rmtree(project_src_dir)
    project_src_dir.mkdir(parents=True, exist_ok=True)

    try:
        with zipfile.ZipFile(temp_zip_path, "r") as zf:
            zf.extractall(project_src_dir)
    except Exception as e:
        shutil.rmtree(project_workspace_dir, ignore_errors=True)
        if temp_zip_path.exists():
            temp_zip_path.unlink()
        raise HTTPException(status_code=500, detail=f"Failed to extract ZIP: {e}")

    try:
        from workers.tasks import run_local_scan
        task = run_local_scan.delay(
            scan.id, ScanType.COMBINED.value, str(project_src_dir)
        )
        scan.celery_task_id = task.id
        db.add(scan)
    except Exception:
        pass

    # Commit updates to celery_task_ids
    await db.commit()

    # Clean up the temporary ZIP file
    if temp_zip_path.exists():
        temp_zip_path.unlink()

    return [
        ScanResponse(
            id=scan.id,
            project_id=scan.project_id,
            project_name=project_name,
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
    ]


@router.post("/folder", response_model=list[ScanResponse], status_code=201)
async def create_folder_scan(
    data: FolderScanCreate,
    db: AsyncSession = Depends(get_db),
):
    """Scan a local folder path directly from the host filesystem."""
    path_str = data.folder_path.strip()
    
    # Normalize the path string to POSIX format with resolved paths to prevent duplicates
    try:
        path_str = str(Path(path_str).resolve().as_posix())
    except Exception:
        path_str = path_str.replace("\\", "/").strip()

    # Reuse existing project if same repo_url
    repo_url = f"folder://{path_str}"
    project_q = select(Project).where(Project.repo_url == repo_url)
    project_result = await db.execute(project_q)
    project = project_result.scalars().first()
    
    if not project:
        path_obj = Path(path_str)
        project_name = f"Folder: {path_obj.name or path_str}"
        
        project = Project(
            name=project_name,
            repo_url=repo_url,
            description="Local folder scan",
            branch="local",
        )
        db.add(project)
        await db.flush()
        await db.refresh(project)
    else:
        project_name = project.name

    scan = Scan(
        project_id=project.id,
        scan_type=ScanType.COMBINED,
        status=ScanStatus.PENDING,
    )
    db.add(scan)
    await db.flush()
    await db.refresh(scan)

    # Commit records to the DB first so the worker can query them
    await db.commit()

    # Dispatch Celery tasks
    try:
        from workers.tasks import run_local_folder_scan
        task = run_local_folder_scan.delay(
            scan.id, ScanType.COMBINED.value, path_str
        )
        scan.celery_task_id = task.id
        db.add(scan)
    except Exception:
        pass

    # Commit updates to celery_task_ids
    await db.commit()

    return [
        ScanResponse(
            id=scan.id,
            project_id=scan.project_id,
            project_name=project_name,
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
    ]


@router.get("/browse")
async def browse_directory(path: str = ""):
    """Browse directories inside the host code directory for selection."""
    base_dir = Path(settings.HOST_CODE_DIR)

    if not path:
        target_dir = base_dir
    else:
        resolved_base = base_dir.resolve()
        normalized_path = path.replace("\\", "/")
        if normalized_path.startswith("/app/host_code") or normalized_path.startswith(settings.HOST_CODE_DIR):
            target_dir = Path(normalized_path)
        else:
            target_dir = base_dir / normalized_path.lstrip("/")
            
        target_dir = target_dir.resolve()
        
        # Ensure target_dir starts with resolved_base to prevent traversal
        if not str(target_dir).startswith(str(resolved_base)):
            target_dir = resolved_base

    if not target_dir.exists() or not target_dir.is_dir():
        raise HTTPException(status_code=400, detail="Directory does not exist or is not a folder")

    try:
        directories = []
        for item in target_dir.iterdir():
            try:
                if item.is_dir() and not item.name.startswith("."):
                    directories.append(item.name)
            except Exception:
                pass
                
        parent_path = None
        if target_dir != base_dir:
            parent_path = str(target_dir.parent.as_posix())

        return {
            "current_path": str(target_dir.as_posix()),
            "parent_path": parent_path,
            "directories": sorted(directories),
            "is_root": target_dir == base_dir
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{scan_id}", response_model=ScanResponse)
async def get_scan(
    scan_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a single scan by ID with detailed info."""
    result = await db.execute(select(Scan).where(Scan.id == scan_id))
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    return await _enrich_scan(db, scan)


@router.delete("/{scan_id}", status_code=204)
async def delete_scan(
    scan_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a scan and its findings."""
    result = await db.execute(select(Scan).where(Scan.id == scan_id))
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    await db.delete(scan)
