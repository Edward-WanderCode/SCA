"""Bandit SAST scanner output parser."""

import logging
from models.finding import Severity

logger = logging.getLogger(__name__)

# Map Bandit severity (LOW, MEDIUM, HIGH) to our Severity levels
SEVERITY_MAP = {
    "LOW": Severity.LOW,
    "MEDIUM": Severity.MEDIUM,
    "HIGH": Severity.HIGH,
    "UNDEFINED": Severity.INFO,
}


def parse_bandit_results(output: dict | list) -> list[dict]:
    """Parse Bandit JSON output into normalized finding records."""
    findings = []

    if not isinstance(output, dict):
        logger.warning("Unexpected Bandit output format")
        return findings

    results = output.get("results", [])
    for result in results:
        try:
            severity_str = result.get("issue_severity", "MEDIUM")
            severity = SEVERITY_MAP.get(severity_str.upper(), Severity.MEDIUM)

            cwe_info = result.get("issue_cwe", {})
            cwe_id = cwe_info.get("id")
            cwe_list = [f"CWE-{cwe_id}"] if cwe_id else []

            # Clean path from /src prefix
            file_path = result.get("filename", "")
            if file_path.startswith("/src/"):
                file_path = file_path[5:]
            elif file_path.startswith("src/"):
                file_path = file_path[4:]
            elif file_path == "/src" or file_path == "src":
                file_path = ""

            finding = {
                "severity": severity,
                "title": f"Bandit {result.get('test_id', 'Rule')}: {result.get('test_name', '')}",
                "description": result.get("issue_text", "").strip(),
                "file_path": file_path,
                "line_start": result.get("line_number"),
                "line_end": result.get("line_number"),
                "code_snippet": result.get("code", ""),
                "rule_id": result.get("test_id", ""),
                "cve_id": None,
                "metadata_json": {
                    "references": [result.get("more_info", "")] if result.get("more_info") else [],
                    "confidence": result.get("issue_confidence", ""),
                    "cwe": cwe_list,
                },
            }
            findings.append(finding)
        except Exception as e:
            logger.warning(f"Failed to parse Bandit result: {e}")
            continue

    logger.info(f"Parsed {len(findings)} findings from Bandit output")
    return findings
