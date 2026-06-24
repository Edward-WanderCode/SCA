"""Project schemas for request/response validation."""

from datetime import datetime
from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    """Schema for creating a new project."""
    name: str = Field(..., min_length=1, max_length=255, description="Project name")
    repo_url: str = Field(..., min_length=1, max_length=500, description="Git repository URL")
    description: str | None = Field(None, description="Project description")
    branch: str = Field("main", max_length=255, description="Branch to scan")
    language: str | None = Field(None, max_length=100, description="Primary language")


class ProjectUpdate(BaseModel):
    """Schema for updating a project."""
    name: str | None = Field(None, min_length=1, max_length=255)
    repo_url: str | None = Field(None, min_length=1, max_length=500)
    description: str | None = None
    branch: str | None = Field(None, max_length=255)
    language: str | None = Field(None, max_length=100)


class ProjectResponse(BaseModel):
    """Schema for project response."""
    id: str
    name: str
    repo_url: str
    description: str | None = None
    branch: str
    language: str | None = None
    created_at: datetime
    updated_at: datetime
    total_scans: int = 0
    last_scan_at: datetime | None = None
    findings: dict | None = None
    findings_diff: dict | None = None

    model_config = {"from_attributes": True}


class ProjectListResponse(BaseModel):
    """Schema for paginated project list."""
    items: list[ProjectResponse]
    total: int
    page: int
    page_size: int
