"""Scan schemas for request/response validation."""

from datetime import datetime
from pydantic import BaseModel, Field
from models.scan import ScanType, ScanStatus


class ScanCreate(BaseModel):
    """Schema for triggering a new scan."""
    project_id: str = Field(..., description="Project ID to scan")
    scan_types: list[ScanType] = Field(
        ..., min_length=1, description="Types of scans to run"
    )


class FolderScanCreate(BaseModel):
    """Schema for triggering a new local folder scan."""
    folder_path: str = Field(..., description="Absolute path to the local directory to scan")
    scan_types: list[ScanType] = Field(
        ..., min_length=1, description="Types of scans to run"
    )


class ScanSummary(BaseModel):
    """Summary statistics for a scan."""
    total_findings: int = 0
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    info: int = 0


class ScanResponse(BaseModel):
    """Schema for scan response."""
    id: str
    project_id: str
    project_name: str | None = None
    scan_type: ScanType
    status: ScanStatus
    progress: int = 0
    progress_message: str | None = None
    celery_task_id: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    duration_seconds: int | None = None
    error_message: str | None = None
    summary: ScanSummary | None = None
    findings_diff: dict | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ScanListResponse(BaseModel):
    """Schema for paginated scan list."""
    items: list[ScanResponse]
    total: int
    page: int
    page_size: int
