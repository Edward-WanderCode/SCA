"""Utility functions for invoking scanner Docker containers and Git operations."""

import subprocess
import json
import os
import shutil
import logging
from pathlib import Path
from config import settings
from core.retry import retry_scanner, retry_git_clone
from core.exceptions import ScannerError, GitCloneError

logger = logging.getLogger(__name__)


@retry_scanner
def run_docker_scanner(
    image: str,
    command_args: list[str],
    volumes: dict[str, str] | None = None,
    timeout: int = 600,
) -> subprocess.CompletedProcess:
    """
    Run a Docker container for scanning.

    Args:
        image: Docker image name
        command_args: Arguments to pass to the container
        volumes: Dict of host_path -> container_path for volume mounts
        timeout: Timeout in seconds (default 10 minutes)

    Returns:
        CompletedProcess with stdout/stderr
    """
    cmd = ["docker", "run", "--rm"]

    # Forward SEMGREP_APP_TOKEN if set in host environment to authenticate Semgrep scans
    semgrep_token = os.environ.get("SEMGREP_APP_TOKEN")
    if semgrep_token:
        cmd.extend(["-e", f"SEMGREP_APP_TOKEN={semgrep_token}"])

    adjusted_args = list(command_args)
    # Add volume mounts
    if volumes:
        for host_path, container_path in volumes.items():
            if host_path.startswith("/app/workspace"):
                vol_name = os.environ.get("WORKSPACE_VOLUME_NAME", "sca_scan_workspace")
                cmd.extend(["-v", f"{vol_name}:/app/workspace"])
                adjusted_args = [arg.replace(container_path, host_path) for arg in adjusted_args]
            elif host_path.startswith("/app/host_code"):
                host_base = os.environ.get("HOST_CODE_DIR_ON_HOST", "d:/Code")
                relative_part = host_path[len("/app/host_code"):].lstrip("/")
                if host_base:
                    translated_path = f"{host_base.rstrip('/')}/{relative_part}"
                else:
                    translated_path = host_path
                cmd.extend(["-v", f"{translated_path}:{container_path}"])
            else:
                cmd.extend(["-v", f"{host_path}:{container_path}"])

    cmd.append(image)
    cmd.extend(adjusted_args)

    logger.info(f"Running scanner: {' '.join(cmd)}")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        logger.info(
            f"Scanner completed with return code {result.returncode}"
        )
        return result
    except subprocess.TimeoutExpired:
        logger.error(f"Scanner timed out after {timeout}s: {image}")
        raise ScannerError(image, f"Timed out after {timeout}s")
    except Exception as e:
        logger.error(f"Scanner error: {e}")
        raise ScannerError(image, str(e))


@retry_git_clone
def clone_repository(repo_url: str, target_dir: str, branch: str = "main") -> str:
    """
    Clone a Git repository to the workspace.

    Args:
        repo_url: Git repository URL
        target_dir: Directory name within workspace
        branch: Branch to checkout

    Returns:
        Full path to cloned repository
    """
    workspace = Path(settings.SCAN_WORKSPACE_DIR)
    workspace.mkdir(parents=True, exist_ok=True)

    repo_path = workspace / target_dir

    # Remove existing if present
    if repo_path.exists():
        shutil.rmtree(repo_path)

    logger.info(f"Cloning {repo_url} (branch: {branch}) to {repo_path}")

    try:
        result = subprocess.run(
            ["git", "clone", "--depth", "1", "--branch", branch, repo_url, str(repo_path)],
            capture_output=True,
            text=True,
            timeout=120,
        )

        if result.returncode != 0:
            # Try without branch specification (might be default branch)
            result = subprocess.run(
                ["git", "clone", "--depth", "1", repo_url, str(repo_path)],
                capture_output=True,
                text=True,
                timeout=120,
            )

        if result.returncode != 0:
            raise GitCloneError(repo_url, result.stderr)

        logger.info(f"Repository cloned successfully to {repo_path}")
        return str(repo_path)

    except subprocess.TimeoutExpired:
        logger.error("Git clone timed out")
        raise GitCloneError(repo_url, "Clone timed out")


def parse_json_stream(output: str) -> list[dict]:
    """
    Parse a stream of JSON objects (one per line).
    Used by TruffleHog which outputs NDJSON.
    """
    results = []
    for line in output.strip().split("\n"):
        line = line.strip()
        if not line:
            continue
        try:
            results.append(json.loads(line))
        except json.JSONDecodeError:
            logger.warning(f"Failed to parse JSON line: {line[:100]}")
            continue
    return results


def parse_json_output(output: str) -> dict | list:
    """Parse standard JSON output from scanners."""
    try:
        return json.loads(output)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse JSON output: {e}")
        return {}


def cleanup_workspace(target_dir: str):
    """Remove a cloned repository from workspace."""
    workspace = Path(settings.SCAN_WORKSPACE_DIR)
    repo_path = workspace / target_dir

    if repo_path.exists():
        shutil.rmtree(repo_path)
        logger.info(f"Cleaned up workspace: {repo_path}")


def calculate_directory_hashes(directory_path: str) -> dict[str, str]:
    """Calculate SHA-256 hashes of all files in the directory (excluding hidden/ignored folders)."""
    import hashlib
    import os
    
    file_hashes = {}
    try:
        for root, dirs, files in os.walk(directory_path):
            dirs[:] = [d for d in dirs if not d.startswith('.')]
            for file in files:
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, directory_path).replace("\\", "/")
                
                hasher = hashlib.sha256()
                try:
                    with open(full_path, "rb") as f:
                        for chunk in iter(lambda: f.read(65536), b""):
                            hasher.update(chunk)
                    file_hashes[rel_path] = hasher.hexdigest()
                except Exception as e:
                    logger.warning(f"Failed to calculate hash for {full_path}: {e}")
    except Exception as e:
        logger.error(f"Error calculating directory hashes for {directory_path}: {e}")
        
    return file_hashes

