"""GoSec SAST scanner output parser."""

import logging
from models.finding import Severity

logger = logging.getLogger(__name__)

# Map GoSec severity (LOW, MEDIUM, HIGH) to our Severity levels
SEVERITY_MAP = {
    "LOW": Severity.LOW,
    "MEDIUM": Severity.MEDIUM,
    "HIGH": Severity.HIGH,
}


def parse_gosec_results(output: dict | list) -> list[dict]:
    """Parse GoSec JSON output into normalized finding records."""
    findings = []

    if not isinstance(output, dict):
        logger.warning("Unexpected GoSec output format")
        return findings

    results = output.get("Issues", [])
    for result in results:
        try:
            severity_str = result.get("severity", "MEDIUM")
            severity = SEVERITY_MAP.get(severity_str.upper(), Severity.MEDIUM)

            cwe_info = result.get("cwe", {})
            cwe_id = cwe_info.get("id")
            cwe_list = [f"CWE-{cwe_id}"] if cwe_id else []

            # Clean path from /src prefix
            file_path = result.get("file", "")
            if file_path.startswith("/src/"):
                file_path = file_path[5:]
            elif file_path.startswith("src/"):
                file_path = file_path[4:]
            elif file_path == "/src" or file_path == "src":
                file_path = ""

            try:
                line_no = int(result.get("line", 1))
            except ValueError:
                line_no = 1

            finding = {
                "severity": severity,
                "title": f"GoSec {result.get('rule_id', 'Rule')}: {result.get('details', '')}",
                "description": result.get("details", "").strip(),
                "file_path": file_path,
                "line_start": line_no,
                "line_end": line_no,
                "code_snippet": result.get("code", ""),
                "rule_id": result.get("rule_id", ""),
                "detector_type": "gosec",
                "cve_id": None,
                "metadata_json": {
                    "references": [cwe_info.get("url", "")] if cwe_info.get("url") else [],
                    "confidence": result.get("confidence", ""),
                    "cwe": cwe_list,
                },
            }
            findings.append(finding)
        except Exception as e:
            logger.warning(f"Failed to parse GoSec result: {e}")
            continue

    logger.info(f"Parsed {len(findings)} findings from GoSec output")
    return findings
