"""OpenGrep (Semgrep-compatible) SAST scanner output parser."""

import logging
from models.finding import Severity

logger = logging.getLogger(__name__)

# Map OpenGrep/Semgrep severity to our severity levels
SEVERITY_MAP = {
    "ERROR": Severity.CRITICAL,
    "WARNING": Severity.HIGH,
    "INFO": Severity.MEDIUM,
    "INVENTORY": Severity.LOW,
    # SARIF levels
    "error": Severity.CRITICAL,
    "warning": Severity.HIGH,
    "note": Severity.MEDIUM,
    "none": Severity.INFO,
}


def parse_opengrep_results(output: dict | list) -> list[dict]:
    """
    Parse OpenGrep JSON output into normalized finding records.

    OpenGrep outputs JSON compatible with Semgrep format:
    {
        "results": [
            {
                "check_id": "rule-id",
                "path": "file.py",
                "start": {"line": 10, "col": 1},
                "end": {"line": 12, "col": 50},
                "extra": {
                    "message": "...",
                    "severity": "WARNING",
                    "lines": "code snippet...",
                    "metadata": {...}
                }
            }
        ]
    }
    """
    findings = []

    # Handle both dict (standard) and list (SARIF) formats
    if isinstance(output, dict):
        results = output.get("results", [])
    elif isinstance(output, list):
        results = output
    else:
        logger.warning("Unexpected OpenGrep output format")
        return findings

    for result in results:
        try:
            extra = result.get("extra", {})
            severity_str = extra.get("severity", "INFO")
            severity = SEVERITY_MAP.get(severity_str, Severity.MEDIUM)

            start = result.get("start", {})
            end = result.get("end", {})
            metadata = extra.get("metadata", {})

            finding = {
                "severity": severity,
                "title": result.get("check_id", "Unknown Rule"),
                "description": extra.get("message", ""),
                "file_path": result.get("path", ""),
                "line_start": start.get("line"),
                "line_end": end.get("line"),
                "code_snippet": extra.get("lines", ""),
                "rule_id": result.get("check_id", ""),
                "cve_id": metadata.get("cve", None),
                "detector_type": "opengrep",
                "metadata_json": {
                    "references": metadata.get("references", []),
                    "category": metadata.get("category", ""),
                    "technology": metadata.get("technology", []),
                    "confidence": metadata.get("confidence", ""),
                    "owasp": metadata.get("owasp", []),
                    "cwe": metadata.get("cwe", []),
                    "source": extra.get("source", ""),
                    "fingerprint": result.get("extra", {}).get("fingerprint", ""),
                },
            }

            findings.append(finding)

        except Exception as e:
            logger.warning(f"Failed to parse OpenGrep result: {e}")
            continue

    logger.info(f"Parsed {len(findings)} findings from OpenGrep output")
    return findings
