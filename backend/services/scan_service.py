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

    # ──────────────────────────────────────────────────────────────
    # Individual scanner methods — all return a ScannerResult dict:
    #   {scanner, ran, success, findings, error, exit_code, files_scanned}
    # ──────────────────────────────────────────────────────────────

    @staticmethod
    def run_bandit_scan(repo_path: str) -> dict:
        """Run Bandit SAST scan on a Python codebase. Returns a ScannerResult dict."""
        logger.info(f"Running Bandit scan on {repo_path}")
        from services.parsers.bandit_parser import parse_bandit_results

        result = {
            "scanner": "Bandit", "ran": True, "success": False,
            "findings": [], "error": None, "exit_code": None, "files_scanned": 0,
        }
        try:
            if settings.USE_LOCAL_BANDIT:
                import subprocess
                cmd = [settings.BANDIT_BIN, "-r", ".", "-f", "json"]
                proc_result = subprocess.run(
                    cmd, capture_output=True, text=True, timeout=600,
                    cwd=repo_path, encoding='utf-8', errors='replace',
                    stdin=subprocess.DEVNULL
                )
                stdout, stderr = proc_result.stdout, proc_result.stderr
                result["exit_code"] = proc_result.returncode
            else:
                docker_result = run_docker_scanner(
                    image=settings.BANDIT_IMAGE,
                    command_args=["-r", "/src", "-f", "json"],
                    volumes={repo_path: "/src"},
                    timeout=600,
                )
                stdout, stderr = docker_result.stdout, docker_result.stderr
                result["exit_code"] = docker_result.returncode

            if stdout:
                output = parse_json_output(stdout)
                findings = parse_bandit_results(output)
                if isinstance(output, dict):
                    metrics = output.get("metrics", {})
                    result["files_scanned"] = len(metrics) if metrics else 0
                result["findings"] = findings
                result["success"] = True
            else:
                err_preview = stderr[:300] if stderr else "No output produced"
                result["error"] = err_preview
                logger.warning(f"Bandit produced no output. stderr: {err_preview}")

        except FileNotFoundError:
            result["error"] = f"Binary not found: {getattr(settings, 'BANDIT_BIN', 'bandit')}"
            logger.error(f"Bandit binary not found: {result['error']}")
        except Exception as e:
            result["error"] = str(e)
            logger.error(f"Bandit scan failed: {e}", exc_info=True)

        return result

    @staticmethod
    def run_gosec_scan(repo_path: str) -> dict:
        """Run GoSec SAST scan on a Go codebase. Returns a ScannerResult dict."""
        logger.info(f"Running GoSec scan on {repo_path}")
        from services.parsers.gosec_parser import parse_gosec_results

        result = {
            "scanner": "GoSec", "ran": True, "success": False,
            "findings": [], "error": None, "exit_code": None, "files_scanned": 0,
        }
        try:
            if settings.USE_LOCAL_GOSEC:
                import subprocess
                cmd = [settings.GOSEC_BIN, "-fmt=json", "./..."]
                proc_result = subprocess.run(
                    cmd, capture_output=True, text=True, timeout=600,
                    cwd=repo_path, encoding='utf-8', errors='replace',
                    stdin=subprocess.DEVNULL
                )
                stdout, stderr = proc_result.stdout, proc_result.stderr
                result["exit_code"] = proc_result.returncode
            else:
                docker_result = run_docker_scanner(
                    image=settings.GOSEC_IMAGE,
                    command_args=["-fmt=json", "/src/..."],
                    volumes={repo_path: "/src"},
                    timeout=600,
                )
                stdout, stderr = docker_result.stdout, docker_result.stderr
                result["exit_code"] = docker_result.returncode

            if stdout:
                output = parse_json_output(stdout)
                findings = parse_gosec_results(output)
                if isinstance(output, dict):
                    stats = output.get("Stats", {})
                    result["files_scanned"] = stats.get("files", 0)
                result["findings"] = findings
                result["success"] = True
            else:
                err_preview = stderr[:300] if stderr else "No output produced"
                result["error"] = err_preview
                logger.warning(f"GoSec produced no output. stderr: {err_preview}")

        except FileNotFoundError:
            result["error"] = f"Binary not found: {getattr(settings, 'GOSEC_BIN', 'gosec')}"
            logger.error(f"GoSec binary not found: {result['error']}")
        except Exception as e:
            result["error"] = str(e)
            logger.error(f"GoSec scan failed: {e}", exc_info=True)

        return result

    # ──────────────────────────────────────────────────────────────
    # Orchestration methods — return (findings, scanner_results)
    # ──────────────────────────────────────────────────────────────

    @classmethod
    def run_sast_scan(cls, repo_path: str) -> tuple[list[dict], list[dict]]:
        """
        Run optimal SAST scans on a repository by auto-detecting languages.

        Returns:
            (findings, scanner_results) — scanner_results is a list of ScannerResult dicts.
        """
        logger.info(f"Running SAST scan orchestration on {repo_path}")
        languages = cls.detect_languages(repo_path)

        findings: list[dict] = []
        scanner_results: list[dict] = []
        import concurrent.futures

        def run_bandit():
            if "python" not in languages:
                return {
                    "scanner": "Bandit", "ran": False, "reason": "No Python files detected",
                    "findings": [], "success": True, "error": None, "exit_code": None, "files_scanned": 0,
                }
            return cls.run_bandit_scan(repo_path)

        def run_gosec():
            if "go" not in languages:
                return {
                    "scanner": "GoSec", "ran": False, "reason": "No Go files detected",
                    "findings": [], "success": True, "error": None, "exit_code": None, "files_scanned": 0,
                }
            return cls.run_gosec_scan(repo_path)

        def run_opengrep():
            opengrep_result = {
                "scanner": "OpenGrep", "ran": True, "success": False,
                "findings": [], "error": None, "exit_code": None, "files_scanned": 0,
            }
            try:
                logger.info(f"Running OpenGrep polyglot scan on {repo_path}")
                exclude_patterns = [
                    "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
                    "*.min.js", "*.min.css", "*.map",
                ]
                if settings.USE_LOCAL_OPENGREP:
                    import subprocess, os
                    cmd = [settings.OPENGREP_BIN, "scan", "--config", "auto", "--json", "--no-git-ignore"]
                    for pat in exclude_patterns:
                        cmd.extend(["--exclude", pat])
                    cmd.extend(["--timeout", "30", "."])
                    # Set env vars to prevent Rich console crash on Windows subprocess
                    scan_env = os.environ.copy()
                    scan_env.update({
                        "NO_COLOR": "1",
                        "TERM": "dumb",
                        "CI": "1",
                        "PYTHONUNBUFFERED": "1",
                        "SEMGREP_SEND_METRICS": "off",
                    })
                    # Use Popen to ensure child processes (opengrep-core) are killed on timeout
                    popen_kwargs = dict(
                        stdin=subprocess.DEVNULL,
                        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                        text=True, cwd=repo_path, encoding='utf-8', errors='replace',
                        env=scan_env,
                    )
                    if os.name == "nt":
                        popen_kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
                    proc = subprocess.Popen(cmd, **popen_kwargs)
                    try:
                        stdout, stderr = proc.communicate(timeout=120)
                        opengrep_result["exit_code"] = proc.returncode
                    except subprocess.TimeoutExpired:
                        logger.warning("OpenGrep timed out after 120s, killing process tree...")
                        try:
                            if os.name == "nt":
                                subprocess.run(
                                    ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                                    capture_output=True, timeout=10,
                                )
                            else:
                                import signal
                                os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
                        except Exception:
                            proc.kill()
                        proc.wait(timeout=5)
                        opengrep_result["error"] = "Timed out after 120s"
                        return opengrep_result
                else:
                    docker_args = ["opengrep", "scan", "--config", "auto", "--json", "--no-git-ignore"]
                    for pat in exclude_patterns:
                        docker_args.extend(["--exclude", pat])
                    docker_args.extend(["--timeout", "30", "/src"])
                    docker_res = run_docker_scanner(
                        image=settings.OPENGREP_IMAGE,
                        command_args=docker_args,
                        volumes={repo_path: "/src"},
                        timeout=300,
                    )
                    stdout, stderr = docker_res.stdout, docker_res.stderr
                    opengrep_result["exit_code"] = docker_res.returncode

                if stdout:
                    output = parse_json_output(stdout)
                    parsed = parse_opengrep_results(output)
                    if isinstance(output, dict):
                        paths = output.get("paths", {})
                        scanned = paths.get("scanned", [])
                        opengrep_result["files_scanned"] = len(scanned) if isinstance(scanned, list) else 0
                    opengrep_result["findings"] = parsed
                    opengrep_result["success"] = True
                else:
                    err_preview = stderr[:300] if stderr else "No output produced"
                    opengrep_result["error"] = err_preview
                    logger.warning(f"OpenGrep produced no output. stderr: {err_preview}")

            except FileNotFoundError:
                opengrep_result["error"] = f"Binary not found: {getattr(settings, 'OPENGREP_BIN', 'opengrep')}"
                logger.error("OpenGrep binary not found")
            except Exception as e:
                opengrep_result["error"] = str(e)
                logger.error(f"OpenGrep scan failed: {e}", exc_info=True)

            return opengrep_result

        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            futures = [
                executor.submit(run_bandit),
                executor.submit(run_gosec),
                executor.submit(run_opengrep),
            ]
            for future in concurrent.futures.as_completed(futures):
                sr = future.result()
                scanner_results.append(sr)
                findings.extend(sr.get("findings", []))

        ran_names = [sr["scanner"] for sr in scanner_results if sr.get("ran")]
        logger.info(f"SAST scan complete. Scanners run: {ran_names}. Total findings: {len(findings)}")
        return findings, scanner_results

    @staticmethod
    def run_vulnerability_scan(repo_path: str) -> tuple[list[dict], list[dict]]:
        """
        Run Trivy vulnerability scan on a repository.

        Returns:
            (findings, scanner_results)
        """
        logger.info(f"Running vulnerability scan on {repo_path}")

        result = {
            "scanner": "Trivy", "ran": True, "success": False,
            "findings": [], "error": None, "exit_code": None, "files_scanned": 0,
        }
        try:
            if settings.USE_LOCAL_TRIVY:
                import subprocess
                cmd = [
                    settings.TRIVY_BIN, "fs",
                    "--format", "json",
                    "--severity", "CRITICAL,HIGH,MEDIUM,LOW",
                    "--scanners", "vuln",
                    ".",
                ]
                proc_result = subprocess.run(
                    cmd, capture_output=True, text=True, timeout=600,
                    cwd=repo_path, encoding='utf-8', errors='replace',
                    stdin=subprocess.DEVNULL
                )
                stdout, stderr = proc_result.stdout, proc_result.stderr
                result["exit_code"] = proc_result.returncode
            else:
                docker_result = run_docker_scanner(
                    image=settings.TRIVY_IMAGE,
                    command_args=[
                        "fs", "--format", "json",
                        "--severity", "CRITICAL,HIGH,MEDIUM,LOW",
                        "--scanners", "vuln", "/src",
                    ],
                    volumes={repo_path: "/src"},
                    timeout=600,
                )
                stdout, stderr = docker_result.stdout, docker_result.stderr
                result["exit_code"] = docker_result.returncode

            if stdout:
                output = parse_json_output(stdout)
                findings = parse_trivy_results(output)
                if isinstance(output, dict):
                    result["files_scanned"] = len(output.get("Results", []))
                result["findings"] = findings
                result["success"] = True
            else:
                err_preview = stderr[:300] if stderr else "No output produced"
                result["error"] = err_preview
                logger.warning(f"Trivy produced no output. stderr: {err_preview}")

        except FileNotFoundError:
            result["error"] = f"Binary not found: {getattr(settings, 'TRIVY_BIN', 'trivy')}"
            logger.error("Trivy binary not found")
        except Exception as e:
            result["error"] = str(e)
            logger.error(f"Trivy scan failed: {e}", exc_info=True)

        return result["findings"], [result]

    @staticmethod
    def run_secret_scan(repo_path: str) -> tuple[list[dict], list[dict]]:
        """
        Run TruffleHog secret detection scan on a repository.

        Returns:
            (findings, scanner_results)
        """
        logger.info(f"Running secret scan on {repo_path}")

        result = {
            "scanner": "TruffleHog", "ran": True, "success": False,
            "findings": [], "error": None, "exit_code": None, "files_scanned": 0,
        }
        try:
            if settings.USE_LOCAL_TRUFFLEHOG:
                import subprocess
                cmd = [
                    settings.TRUFFLEHOG_BIN,
                    "filesystem",
                    "--json",
                    "--no-update",
                    ".",
                ]
                proc_result = subprocess.run(
                    cmd, capture_output=True, text=True, timeout=600,
                    cwd=repo_path, encoding='utf-8', errors='replace',
                    stdin=subprocess.DEVNULL
                )
                stdout, stderr = proc_result.stdout, proc_result.stderr
                result["exit_code"] = proc_result.returncode
            else:
                docker_result = run_docker_scanner(
                    image=settings.TRUFFLEHOG_IMAGE,
                    command_args=["filesystem", "--json", "--no-update", "/src"],
                    volumes={repo_path: "/src"},
                    timeout=600,
                )
                stdout, stderr = docker_result.stdout, docker_result.stderr
                result["exit_code"] = docker_result.returncode

            if stdout:
                parsed_results = parse_json_stream(stdout)
                findings = parse_trufflehog_results(parsed_results)
                result["findings"] = findings
                result["success"] = True
            else:
                # TruffleHog outputs nothing when no secrets found — that's OK if exit code is 0
                if result.get("exit_code") not in (None, 0) and stderr and stderr.strip():
                    err_preview = stderr[:300]
                    result["error"] = err_preview
                    logger.warning(f"TruffleHog produced no output. stderr: {err_preview}")
                else:
                    # No output + exit 0 = no secrets found, which is a valid success
                    result["success"] = True

        except FileNotFoundError:
            result["error"] = f"Binary not found: {getattr(settings, 'TRUFFLEHOG_BIN', 'trufflehog')}"
            logger.error("TruffleHog binary not found")
        except Exception as e:
            result["error"] = str(e)
            logger.error(f"TruffleHog scan failed: {e}", exc_info=True)

        return result["findings"], [result]

    @classmethod
    def execute_scan(cls, scan_type: str, repo_path: str) -> tuple[list[dict], list[dict]]:
        """
        Execute a scan based on type.

        Args:
            scan_type: Type of scan (sast, vulnerability, secret, combined)
            repo_path: Path to repository

        Returns:
            (findings, scanner_results) tuple
        """
        if scan_type == "combined":
            import concurrent.futures
            findings: list[dict] = []
            all_scanner_results: list[dict] = []

            with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
                future_sast = executor.submit(cls.run_sast_scan, repo_path)
                future_vuln = executor.submit(cls.run_vulnerability_scan, repo_path)
                future_secret = executor.submit(cls.run_secret_scan, repo_path)

                for future, label in [
                    (future_sast, "SAST"),
                    (future_vuln, "Vulnerability"),
                    (future_secret, "Secret"),
                ]:
                    try:
                        f, sr = future.result()
                        findings.extend(f)
                        all_scanner_results.extend(sr)
                    except Exception as e:
                        logger.error(f"{label} scan failed inside combined scan: {e}")

            return findings, all_scanner_results

        scanner_map = {
            "sast": cls.run_sast_scan,
            "vulnerability": cls.run_vulnerability_scan,
            "secret": cls.run_secret_scan,
        }

        scanner_fn = scanner_map.get(scan_type)
        if not scanner_fn:
            raise ValueError(f"Unknown scan type: {scan_type}")

        return scanner_fn(repo_path)
