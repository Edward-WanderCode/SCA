from pydantic import BaseModel, HttpUrl
from typing import Optional, Any, Dict

class WebhookConfigResponse(BaseModel):
    """Response model for fetching a project's webhook configuration."""
    webhook_url: str
    webhook_secret: str
    provider: Optional[str] = None

class WebhookGenerateRequest(BaseModel):
    """Request model for generating a new webhook secret."""
    provider: str  # Git provider identifier


class GithubWebhookPayload(BaseModel):
    """Flexible model for parsing incoming GitHub webhooks."""
    action: Optional[str] = None
    ref: Optional[str] = None
    after: Optional[str] = None
    repository: Dict[str, Any]
    pull_request: Optional[Dict[str, Any]] = None
    sender: Optional[Dict[str, Any]] = None

class GitlabWebhookPayload(BaseModel):
    """Flexible model for parsing incoming GitLab webhooks."""
    object_kind: str
    ref: Optional[str] = None
    after: Optional[str] = None
    project: Dict[str, Any]
    object_attributes: Optional[Dict[str, Any]] = None
    user: Optional[Dict[str, Any]] = None
