"""Scan orchestration service."""

import logging
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models.project import Project
from models.scan import Scan, ScanType, ScanStatus
from models.finding import Finding
from config import settings
from utils.scanner_utils import (
    run_docker_scanner,
    clone_repository,
    parse_json_output,
    parse_json_stream,
    cleanup_workspace,
)
from services.parsers.opengrep_parser import parse_opengrep_results
from services.parsers.trivy_parser import parse_trivy_results
from services.parsers.trufflehog_parser import parse_trufflehog_results

logger = logging.getLogger(__name__)


class ScanService:
    """Service for orchestrating security scans."""

    @staticmethod
    def detect_languages(repo_path: str) -> list[str]:
        """Detect dominant programming languages in the repository."""
        import os
        languages = set()
        try:
            for root, dirs, files in os.walk(repo_path):
                dirs[:] = [d for d in dirs if not d.startswith('.')]
                for file in files:
                    ext = os.path.splitext(file)[1].lower()
                    if ext == ".py":
                        languages.add("python")
                    elif ext == ".go" or file == "go.mod":
                        languages.add("go")
                    elif ext in [".js", ".jsx", ".ts", ".tsx"] or file == "package.json":
                        languages.add("javascript")
                    elif ext in [".java", ".class"] or file in ["pom.xml", "build.gradle"]:
                        languages.add("java")
                    elif ext == ".rs" or file == "Cargo.toml":
                        languages.add("rust")
        except Exception as e:
            logger.warning(f"Error detecting languages in {repo_path}: {e}")
        
        detected = list(languages)
        logger.info(f"Detected languages in {repo_path}: {detected}")
        return detected

    @staticmethod
    def run_bandit_scan(repo_path: str) -> list[dict]:
        """Run Bandit SAST scan on a Python codebase."""
        logger.info(f"Running Bandit scan on {repo_path}")
        from services.parsers.bandit_parser import parse_bandit_results

        result = run_docker_scanner(
            image=settings.BANDIT_IMAGE,
            command_args=[
                "-r",
                "/src",
                "-f", "json",
            ],
            volumes={repo_path: "/src"},
            timeout=600,
        )

        if result.stdout:
            output = parse_json_output(result.stdout)
            return parse_bandit_results(output)

        logger.warning(f"Bandit produced no output. stderr: {result.stderr[:500]}")
        return []

    @staticmethod
    def run_gosec_scan(repo_path: str) -> list[dict]:
        """Run GoSec SAST scan on a Go codebase."""
        logger.info(f"Running GoSec scan on {repo_path}")
        from services.parsers.gosec_parser import parse_gosec_results

        result = run_docker_scanner(
            image=settings.GOSEC_IMAGE,
            command_args=[
                "-fmt=json",
                "/src/...",
            ],
            volumes={repo_path: "/src"},
            timeout=600,
        )

        if result.stdout:
            output = parse_json_output(result.stdout)
            return parse_gosec_results(output)

        logger.warning(f"GoSec produced no output. stderr: {result.stderr[:500]}")
        return []

    @classmethod
    def run_sast_scan(cls, repo_path: str) -> list[dict]:
        """
        Run optimal SAST scans on a repository by auto-detecting languages.

        Args:
            repo_path: Path to the cloned repository

        Returns:
            List of normalized finding dicts
        """
        logger.info(f"Running SAST scan orchestration on {repo_path}")
        languages = cls.detect_languages(repo_path)
        
        findings = []
        scanners_run = []

        # 1. Run Python-specific scanner
        if "python" in languages:
            try:
                findings.extend(cls.run_bandit_scan(repo_path))
                scanners_run.append("Bandit")
            except Exception as e:
                logger.error(f"Bandit scan failed: {e}", exc_info=True)

        # 2. Run Go-specific scanner
        if "go" in languages:
            try:
                findings.extend(cls.run_gosec_scan(repo_path))
                scanners_run.append("GoSec")
            except Exception as e:
                logger.error(f"GoSec scan failed: {e}", exc_info=True)

        # 3. Run OpenGrep as polyglot scanner
        try:
            logger.info(f"Running OpenGrep polyglot scan on {repo_path}")
            if settings.USE_LOCAL_OPENGREP:
                import subprocess
                cmd = [
                    "opengrep",
                    "scan",
                    "--config", "auto",
                    "--json",
                    "--no-git-ignore",
                    repo_path,
                ]
                logger.info(f"Running local scanner: {' '.join(cmd)}")
                proc_result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=600,
                )
                stdout = proc_result.stdout
                stderr = proc_result.stderr
            else:
                result = run_docker_scanner(
                    image=settings.OPENGREP_IMAGE,
                    command_args=[
                        "opengrep",
                        "scan",
                        "--config", "auto",
                        "--json",
                        "--no-git-ignore",
                        "/src",
                    ],
                    volumes={repo_path: "/src"},
                    timeout=600,
                )
                stdout = result.stdout
                stderr = result.stderr

            if stdout:
                output = parse_json_output(stdout)
                opengrep_findings = parse_opengrep_results(output)
                findings.extend(opengrep_findings)
                scanners_run.append("OpenGrep")
            else:
                logger.warning(f"OpenGrep produced no output. stderr: {stderr[:500]}")
        except Exception as e:
            logger.error(f"OpenGrep scan failed: {e}", exc_info=True)

        logger.info(f"SAST scan complete. Scanners run: {scanners_run}. Total findings: {len(findings)}")
        return findings

    @staticmethod
    def run_vulnerability_scan(repo_path: str) -> list[dict]:
        """
        Run Trivy vulnerability scan on a repository.

        Args:
            repo_path: Path to the cloned repository

        Returns:
            List of normalized finding dicts
        """
        logger.info(f"Running vulnerability scan on {repo_path}")

        result = run_docker_scanner(
            image=settings.TRIVY_IMAGE,
            command_args=[
                "fs",
                "--format", "json",
                "--severity", "CRITICAL,HIGH,MEDIUM,LOW",
                "--scanners", "vuln",
                "/src",
            ],
            volumes={repo_path: "/src"},
            timeout=600,
        )

        if result.stdout:
            output = parse_json_output(result.stdout)
            return parse_trivy_results(output)

        logger.warning(f"Trivy produced no output. stderr: {result.stderr[:500]}")
        return []

    @staticmethod
    def run_secret_scan(repo_path: str) -> list[dict]:
        """
        Run TruffleHog secret detection scan on a repository.

        Args:
            repo_path: Path to the cloned repository

        Returns:
            List of normalized finding dicts
        """
        logger.info(f"Running secret scan on {repo_path}")

        result = run_docker_scanner(
            image=settings.TRUFFLEHOG_IMAGE,
            command_args=[
                "filesystem",
                "--json",
                "--no-update",
                "/src",
            ],
            volumes={repo_path: "/src"},
            timeout=600,
        )

        if result.stdout:
            results = parse_json_stream(result.stdout)
            return parse_trufflehog_results(results)

        logger.warning(f"TruffleHog produced no output. stderr: {result.stderr[:500]}")
        return []

    @classmethod
    def execute_scan(cls, scan_type: str, repo_path: str) -> list[dict]:
        """
        Execute a scan based on type.

        Args:
            scan_type: Type of scan (sast, vulnerability, secret, combined)
            repo_path: Path to repository

        Returns:
            List of finding dicts
        """
        if scan_type == "combined":
            findings = []
            
            # 1. Run SAST Scan
            try:
                findings.extend(cls.run_sast_scan(repo_path))
            except Exception as e:
                logger.error(f"SAST scan failed inside combined scan: {e}")
                
            # 2. Run Vulnerability Scan
            try:
                findings.extend(cls.run_vulnerability_scan(repo_path))
            except Exception as e:
                logger.error(f"Vulnerability scan failed inside combined scan: {e}")
                
            # 3. Run Secret Scan
            try:
                findings.extend(cls.run_secret_scan(repo_path))
            except Exception as e:
                logger.error(f"Secret scan failed inside combined scan: {e}")
                
            return findings

        scanners = {
            "sast": cls.run_sast_scan,
            "vulnerability": cls.run_vulnerability_scan,
            "secret": cls.run_secret_scan,
        }

        scanner_fn = scanners.get(scan_type)
        if not scanner_fn:
            raise ValueError(f"Unknown scan type: {scan_type}")

        return scanner_fn(repo_path)
