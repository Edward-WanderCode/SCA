"""Scan management API routes."""

import subprocess
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
from models.user import User
from schemas.scan import ScanCreate, ScanResponse, ScanListResponse, ScanSummary, FolderScanCreate
from api.deps import get_current_active_user, require_analyst
from config import settings
from core.cache import clear_all_api_caches

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
    current_user: User = Depends(get_current_active_user),
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
    current_user: User = Depends(require_analyst),
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
    project_id: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_analyst),
):
    """Scan a local code directory uploaded as a ZIP or RAR file."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="A ZIP or RAR file is required")

    filename_lower = file.filename.lower()
    if not (filename_lower.endswith('.zip') or filename_lower.endswith('.rar')):
        raise HTTPException(status_code=400, detail="Only ZIP and RAR files are supported")

    if not scan_types or not scan_types.strip():
        scan_types = ScanType.COMBINED.value

    is_zip = filename_lower.endswith('.zip')
    is_rar = filename_lower.endswith('.rar')

    try:
        types = [ScanType(t.strip()) for t in scan_types.split(",") if t.strip()]
        if not types:
            types = [ScanType.COMBINED]
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid scan type: {e}")

    # Save uploaded archive to a temporary file preserving its extension
    suffix = Path(file.filename).suffix.lower() or ".zip"
    temp_archive_id = str(uuid.uuid4())
    temp_archive_path = Path(settings.SCAN_WORKSPACE_DIR) / f"temp_{temp_archive_id}{suffix}"
    Path(settings.SCAN_WORKSPACE_DIR).mkdir(parents=True, exist_ok=True)

    try:
        import aiofiles
        async with aiofiles.open(temp_archive_path, "wb") as f:
            while chunk := await file.read(1024 * 1024):  # 1MB chunks
                await f.write(chunk)
    except Exception as e:
        if temp_archive_path.exists():
            temp_archive_path.unlink()
        raise HTTPException(status_code=500, detail=f"Failed to save upload: {e}")

    # Validate archive format once
    if is_zip:
        if not zipfile.is_zipfile(temp_archive_path):
            temp_archive_path.unlink()
            raise HTTPException(status_code=400, detail="Invalid ZIP file structure")

    if project_id and project_id.strip():
        project_q = select(Project).where(Project.id == project_id.strip())
        project_result = await db.execute(project_q)
        project = project_result.scalars().first()
        if not project:
            if temp_archive_path.exists():
                temp_archive_path.unlink()
            raise HTTPException(status_code=404, detail="Specified project not found")
        project_name = project.name
    else:
        # Reuse existing project if same repo_url or similar project base prefix
        repo_url = f"local://{file.filename}"
        project_q = select(Project).where(Project.repo_url == repo_url)
        project_result = await db.execute(project_q)
        project = project_result.scalars().first()
        
        if not project:
            import re
            clean_filename = file.filename.rsplit('.', 1)[0]
            # Strip date stamps like 20260619, version tags like v1/v2, or fix suffixes
            base_prefix = re.sub(r'[_.-]?(?:fix|v\d+|\d{8}|\d{6}).*$', '', clean_filename, flags=re.IGNORECASE).strip()
            
            if base_prefix and len(base_prefix) >= 3:
                all_local_projects = (await db.execute(
                    select(Project).where(Project.repo_url.like("local://%"))
                )).scalars().all()

                for p in all_local_projects:
                    p_clean = p.name.replace("Local: ", "").strip()
                    p_base = re.sub(r'[_.-]?(?:fix|v\d+|\d{8}|\d{6}).*$', '', p_clean, flags=re.IGNORECASE).strip()
                    if p_base and (p_base.lower() == base_prefix.lower() or p_clean.lower().startswith(base_prefix.lower())):
                        project = p
                        project_name = p.name
                        logger.info(f"Matched uploaded ZIP '{file.filename}' to existing project '{p.name}' (ID: {p.id})")
                        break

        if not project:
            clean_filename = file.filename.rsplit('.', 1)[0]
            project_name = f"Local: {clean_filename}"
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
        summary={"filename": file.filename},
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
        if is_zip:
            with zipfile.ZipFile(temp_archive_path, "r") as zf:
                zf.extractall(project_src_dir)
        else:
            extract_dir = project_workspace_dir / "extract_temp"
            if extract_dir.exists():
                shutil.rmtree(extract_dir)
            extract_dir.mkdir(parents=True, exist_ok=True)

            if shutil.which("unrar"):
                result = subprocess.run(
                    ["unrar", "x", "-y", str(temp_archive_path), str(extract_dir)],
                    capture_output=True,
                    text=True,
                )
                if result.returncode != 0:
                    result = subprocess.run(
                        ["unar", "-q", "-o", str(extract_dir), str(temp_archive_path)],
                        capture_output=True,
                        text=True,
                    )
            else:
                result = subprocess.run(
                    ["unar", "-q", "-o", str(extract_dir), str(temp_archive_path)],
                    capture_output=True,
                    text=True,
                )
            if result.returncode != 0:
                raise RuntimeError(result.stderr or result.stdout or "RAR extraction failed")

            for item in extract_dir.iterdir():
                dest = project_src_dir / item.name
                if item.is_dir():
                    shutil.copytree(item, dest, dirs_exist_ok=True)
                else:
                    shutil.copy2(item, dest)
            shutil.rmtree(extract_dir, ignore_errors=True)
    except Exception as e:
        shutil.rmtree(project_workspace_dir, ignore_errors=True)
        if temp_archive_path.exists():
            temp_archive_path.unlink()
        raise HTTPException(status_code=500, detail=f"Failed to extract archive: {e}")

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

    # Clean up the temporary archive file
    if temp_archive_path.exists():
        temp_archive_path.unlink()

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


@router.post('/local-folder', response_model=list[ScanResponse], status_code=201)
async def create_local_folder_scan(
    files: list[UploadFile] = File(...),
    scan_types: str = Form(...),
    project_id: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_analyst),
):
    """Scan a local folder uploaded as a directory tree from the browser."""
    if not files:
        raise HTTPException(status_code=400, detail="No folder files were uploaded")

    if not scan_types or not scan_types.strip():
        scan_types = ScanType.COMBINED.value

    try:
        types = [ScanType(t.strip()) for t in scan_types.split(',') if t.strip()]
        if not types:
            types = [ScanType.COMBINED]
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid scan type: {e}")

    # Determine a stable folder name from the first uploaded relative path
    first_path = getattr(files[0], 'filename', '')
    if not first_path:
        raise HTTPException(status_code=400, detail="Uploaded files must include a relative path")

    normalized_first = first_path.replace('\\', '/').lstrip('/')
    root_folder_name = normalized_first.split('/')[0] or 'uploaded-folder'
    folder_label = root_folder_name

    if project_id and project_id.strip():
        project_q = select(Project).where(Project.id == project_id.strip())
        project_result = await db.execute(project_q)
        project = project_result.scalars().first()
        if not project:
            raise HTTPException(status_code=404, detail="Specified project not found")
        project_name = project.name
    else:
        repo_url = f"local-folder://{folder_label}"
        project_q = select(Project).where(Project.repo_url == repo_url)
        project_result = await db.execute(project_q)
        project = project_result.scalars().first()

        if not project:
            project_name = f"Local Folder: {folder_label}"
            project = Project(
                name=project_name,
                repo_url=repo_url,
                description="Uploaded folder scan",
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
        summary={"filename": folder_label},
    )
    db.add(scan)
    await db.flush()
    await db.refresh(scan)
    await db.commit()

    project_workspace_dir = Path(settings.SCAN_WORKSPACE_DIR) / "projects" / project.id
    project_src_dir = project_workspace_dir / "src"
    if project_src_dir.exists():
        shutil.rmtree(project_src_dir)
    project_src_dir.mkdir(parents=True, exist_ok=True)

    try:
        for upload_file in files:
            raw_path = getattr(upload_file, 'filename', '')
            if not raw_path:
                continue
            rel_path = Path(raw_path.replace('\\', '/')).relative_to(root_folder_name)
            dest_path = project_src_dir / rel_path
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            import aiofiles
            async with aiofiles.open(dest_path, 'wb') as out_file:
                while chunk := await upload_file.read(1024 * 1024):
                    await out_file.write(chunk)
    except Exception as e:
        shutil.rmtree(project_workspace_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded folder files: {e}")

    try:
        from workers.tasks import run_local_scan
        task = run_local_scan.delay(scan.id, ScanType.COMBINED.value, str(project_src_dir))
        scan.celery_task_id = task.id
        db.add(scan)
    except Exception:
        pass

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


@router.post("/folder", response_model=list[ScanResponse], status_code=201)
async def create_folder_scan(
    data: FolderScanCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_analyst),
):
    """Scan a local folder path directly from the host filesystem."""
    path_str = data.folder_path.strip()
    
    # Normalize the path string to POSIX format with resolved paths to prevent duplicates
    try:
        path_str = str(Path(path_str).resolve().as_posix())
    except Exception:
        path_str = path_str.replace("\\", "/").strip()

    if data.project_id and data.project_id.strip():
        project_q = select(Project).where(Project.id == data.project_id.strip())
        project_result = await db.execute(project_q)
        project = project_result.scalars().first()
        if not project:
            raise HTTPException(status_code=404, detail="Specified project not found")
        project_name = project.name
    else:
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
    current_user: User = Depends(get_current_active_user),
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
    current_user: User = Depends(require_analyst),
):
    """Delete a scan and its findings."""
    result = await db.execute(select(Scan).where(Scan.id == scan_id))
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    await db.delete(scan)
    await db.commit()
    await clear_all_api_caches()


@router.get("/{scan_id}/sarif")
async def export_sarif(
    scan_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Export scan findings in SARIF format."""
    result = await db.execute(select(Scan).where(Scan.id == scan_id))
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    findings_result = await db.execute(select(Finding).where(Finding.scan_id == scan_id))
    findings = findings_result.scalars().all()

    sarif_log = {
        "version": "2.1.0",
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "runs": [
            {
                "tool": {
                    "driver": {
                        "name": "SCA Platform",
                        "informationUri": "https://github.com/your-repo/sca-platform",
                        "rules": []
                    }
                },
                "results": []
            }
        ]
    }

    rules_added = set()
    rules = sarif_log["runs"][0]["tool"]["driver"]["rules"]
    results = sarif_log["runs"][0]["results"]

    for finding in findings:
        rule_id = finding.rule_id or "unknown-rule"
        if rule_id not in rules_added:
            rules.append({
                "id": rule_id,
                "shortDescription": {"text": finding.title or "Unknown rule"}
            })
            rules_added.add(rule_id)

        result_obj = {
            "ruleId": rule_id,
            "message": {
                "text": finding.description or finding.title or "No description"
            },
            "locations": [],
            "properties": {
                "severity": finding.severity.value if hasattr(finding.severity, "value") else str(finding.severity),
                "status": finding.status
            }
        }

        if finding.file_path:
            location = {
                "physicalLocation": {
                    "artifactLocation": {
                        "uri": finding.file_path
                    }
                }
            }
            if finding.line_start:
                location["physicalLocation"]["region"] = {
                    "startLine": finding.line_start,
                    "endLine": finding.line_end or finding.line_start
                }
            result_obj["locations"].append(location)

        results.append(result_obj)

    return sarif_log
