import json
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from sqlalchemy.ext.asyncio import AsyncSession
from db.session import get_db
from models.project import Project
from schemas.webhook import GithubWebhookPayload, GitlabWebhookPayload
from services.webhook_service import (
    verify_github_signature,
    verify_gitlab_token,
    handle_github_webhook,
    handle_gitlab_webhook
)
from core.logging import logger
from sqlalchemy import select

router = APIRouter()

@router.post("/github/{project_id}")
async def github_webhook(
    project_id: str,
    request: Request,
    x_hub_signature_256: str = Header(None),
    x_github_event: str = Header(None),
    db: AsyncSession = Depends(get_db)
):
    """Receive and process GitHub webhooks."""
    # 1. Fetch project
    result = await db.execute(select(Project).filter(Project.id == project_id))
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    if not project.webhook_secret:
        raise HTTPException(status_code=400, detail="Webhook secret not configured for this project")

    # 2. Verify signature
    payload_body = await request.body()
    if not verify_github_signature(payload_body, project.webhook_secret, x_hub_signature_256):
        logger.warning(f"Invalid GitHub webhook signature for project {project_id}")
        raise HTTPException(status_code=401, detail="Invalid signature")

    # 3. Parse and handle payload
    try:
        payload_data = json.loads(payload_body)
        payload = GithubWebhookPayload(**payload_data)
        
        # We only care about push and pull_request events
        if x_github_event in ["push", "pull_request"]:
            await handle_github_webhook(project, payload, db)
            
        return {"status": "ok", "message": f"Processed {x_github_event} event"}
        
    except Exception as e:
        logger.error(f"Error processing GitHub webhook: {str(e)}")
        raise HTTPException(status_code=400, detail="Error processing payload")


@router.post("/gitlab/{project_id}")
async def gitlab_webhook(
    project_id: str,
    request: Request,
    x_gitlab_token: str = Header(None),
    x_gitlab_event: str = Header(None),
    db: AsyncSession = Depends(get_db)
):
    """Receive and process GitLab webhooks."""
    # 1. Fetch project
    result = await db.execute(select(Project).filter(Project.id == project_id))
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    if not project.webhook_secret:
        raise HTTPException(status_code=400, detail="Webhook secret not configured for this project")

    # 2. Verify token
    if not verify_gitlab_token(project.webhook_secret, x_gitlab_token):
        logger.warning(f"Invalid GitLab webhook token for project {project_id}")
        raise HTTPException(status_code=401, detail="Invalid token")

    # 3. Parse and handle payload
    payload_body = await request.body()
    try:
        payload_data = json.loads(payload_body)
        payload = GitlabWebhookPayload(**payload_data)
        
        # Handle push or merge_request events
        if x_gitlab_event in ["Push Hook", "Merge Request Hook"]:
            await handle_gitlab_webhook(project, payload, db)
            
        return {"status": "ok", "message": f"Processed {x_gitlab_event} event"}
        
    except Exception as e:
        logger.error(f"Error processing GitLab webhook: {str(e)}")
        raise HTTPException(status_code=400, detail="Error processing payload")
