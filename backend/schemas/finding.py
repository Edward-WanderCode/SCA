"""Finding schemas for request/response validation."""

from datetime import datetime
from pydantic import BaseModel, Field
from models.finding import Severity


class FindingResponse(BaseModel):
    """Schema for finding response."""
    id: str
    scan_id: str
    severity: Severity
    title: str
    description: str | None = None
    file_path: str | None = None
    line_start: int | None = None
    line_end: int | None = None
    code_snippet: str | None = None
    rule_id: str | None = None
    cve_id: str | None = None
    cvss_score: float | None = None
    package_name: str | None = None
    package_version: str | None = None
    fixed_version: str | None = None
    detector_type: str | None = None
    verified: bool | None = None
    metadata_json: dict | None = None
    status: str = "open"
    is_new: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


class FindingListResponse(BaseModel):
    """Schema for paginated finding list."""
    items: list[FindingResponse]
    total: int
    page: int
    page_size: int


class FindingFilters(BaseModel):
    """Filters for querying findings."""
    severity: list[Severity] | None = None
    detector_type: str | None = None
    scan_type: str | None = None
    file_path: str | None = None
    rule_id: str | None = None
    cve_id: str | None = None
    verified: bool | None = None
    status: str | None = None
    search: str | None = Field(None, description="Search in title and description")

class FindingUpdateStatus(BaseModel):
    """Schema for updating finding status."""
    status: str = Field(..., description="The new status (open, ignored, resolved)")
