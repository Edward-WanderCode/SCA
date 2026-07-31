import hmac
import hashlib
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from models.project import Project
from schemas.webhook import GithubWebhookPayload, GitlabWebhookPayload
from core.logging import logger

def verify_github_signature(payload_body: bytes, secret_token: str, signature_header: str) -> bool:
    """Verify that the webhook payload was sent by GitHub."""
    if not signature_header:
        return False
    hash_object = hmac.new(secret_token.encode("utf-8"), msg=payload_body, digestmod=hashlib.sha256)
    expected_signature = "sha256=" + hash_object.hexdigest()
    return hmac.compare_digest(expected_signature, signature_header)

def verify_gitlab_token(secret_token: str, token_header: str) -> bool:
    """Verify GitLab webhook token."""
    if not token_header or not secret_token:
        return False
    return hmac.compare_digest(secret_token, token_header)

async def handle_github_webhook(
    project: Project,
    payload: GithubWebhookPayload,
    db: AsyncSession
):
    """Process GitHub webhook events (push, pull_request)."""
    # For a push event
    if payload.ref:
        branch = payload.ref.replace("refs/heads/", "")
        commit_sha = payload.after
        logger.info(f"GitHub Push event for project {project.name}, branch {branch}, commit {commit_sha}")
        # Only trigger for project branch or main
        if branch == project.branch or branch == "main":
            await _trigger_scan_for_webhook(project, db, branch, commit_sha)
        else:
            logger.info(f"Ignoring push for branch {branch}")
            
    # For a pull request event
    elif payload.action in ["opened", "synchronize", "reopened"]:
        if payload.pull_request:
            branch = payload.pull_request.get("head", {}).get("ref")
            commit_sha = payload.pull_request.get("head", {}).get("sha")
            logger.info(f"GitHub PR event for project {project.name}, branch {branch}, commit {commit_sha}")
            await _trigger_scan_for_webhook(project, db, branch, commit_sha)


async def handle_gitlab_webhook(
    project: Project,
    payload: GitlabWebhookPayload,
    db: AsyncSession
):
    """Process GitLab webhook events."""
    if payload.object_kind == "push":
        branch = payload.ref.replace("refs/heads/", "") if payload.ref else ""
        commit_sha = payload.after
        logger.info(f"GitLab Push event for project {project.name}, branch {branch}, commit {commit_sha}")
        if branch == project.branch or branch == "main":
            await _trigger_scan_for_webhook(project, db, branch, commit_sha)
            
    elif payload.object_kind == "merge_request":
        attrs = payload.object_attributes or {}
        action = attrs.get("action")
        if action in ["open", "update", "reopen"]:
            branch = attrs.get("source_branch")
            commit_sha = attrs.get("last_commit", {}).get("id")
            logger.info(f"GitLab MR event for project {project.name}, branch {branch}, commit {commit_sha}")
            await _trigger_scan_for_webhook(project, db, branch, commit_sha)


async def _trigger_scan_for_webhook(project: Project, db: AsyncSession, branch: str, commit_sha: str, pr_number: int = None):
    """Trigger a scan via the scanner service."""
    from services.scan_service import scan_project_task
    from schemas.scan import ScanCreate
    import uuid
    
    from models.scan import Scan
    scan_id = str(uuid.uuid4())
    db_scan = Scan(
        id=scan_id,
        project_id=project.id,
        scan_type="sast",
        status="pending"
    )
    db.add(db_scan)
    await db.commit()
    
    logger.info(f"Triggered scan {scan_id} for project {project.id} from webhook.")
    
    webhook_metadata = {
        "commit_sha": commit_sha,
        "pr_number": pr_number,
        "branch": branch
    }
    
    from workers.tasks import run_scan
    run_scan.delay(scan_id, "sast", webhook_metadata)
    
def post_github_commit_status(repo_url: str, commit_sha: str, state: str, description: str, target_url: str = None):
    """Post a commit status to GitHub using httpx."""
    import httpx
    from config import settings
    
    if not settings.GITHUB_TOKEN:
        return
        
    # extract owner/repo from https://github.com/owner/repo
    if "github.com/" not in repo_url:
        return
        
    parts = repo_url.rstrip(".git").split("github.com/")[-1].split("/")
    if len(parts) < 2:
        return
    owner, repo = parts[0], parts[1]
    
    url = f"https://api.github.com/repos/{owner}/{repo}/statuses/{commit_sha}"
    headers = {
        "Authorization": f"token {settings.GITHUB_TOKEN}",
        "Accept": "application/vnd.github.v3+json"
    }
    data = {
        "state": state, # pending, success, error, failure
        "description": description,
        "context": "SCA Platform"
    }
    if target_url:
        data["target_url"] = target_url
        
    try:
        httpx.post(url, headers=headers, json=data)
    except Exception as e:
        logger.error(f"Failed to post GitHub commit status: {e}")

def post_github_pr_comment(repo_url: str, pr_number: int, comment: str):
    """Post a comment to a GitHub PR."""
    import httpx
    from config import settings
    
    if not settings.GITHUB_TOKEN or not pr_number:
        return
        
    if "github.com/" not in repo_url:
        return
        
    parts = repo_url.rstrip(".git").split("github.com/")[-1].split("/")
    if len(parts) < 2:
        return
    owner, repo = parts[0], parts[1]
    
    url = f"https://api.github.com/repos/{owner}/{repo}/issues/{pr_number}/comments"
    headers = {
        "Authorization": f"token {settings.GITHUB_TOKEN}",
        "Accept": "application/vnd.github.v3+json"
    }
    data = {
        "body": comment
    }
    try:
        httpx.post(url, headers=headers, json=data)
    except Exception as e:
        logger.error(f"Failed to post GitHub PR comment: {e}")

