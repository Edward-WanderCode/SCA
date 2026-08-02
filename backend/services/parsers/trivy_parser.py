"""Trivy vulnerability scanner output parser."""

import logging
from models.finding import Severity

logger = logging.getLogger(__name__)

# Map Trivy severity to our severity levels
SEVERITY_MAP = {
    "CRITICAL": Severity.CRITICAL,
    "HIGH": Severity.HIGH,
    "MEDIUM": Severity.MEDIUM,
    "LOW": Severity.LOW,
    "UNKNOWN": Severity.INFO,
}


def parse_trivy_results(output: dict) -> list[dict]:
    """
    Parse Trivy JSON output into normalized finding records.

    Trivy fs --format json output structure:
    {
        "Results": [
            {
                "Target": "package-lock.json",
                "Class": "lang-pkgs",
                "Type": "npm",
                "Vulnerabilities": [
                    {
                        "VulnerabilityID": "CVE-2023-xxxx",
                        "PkgName": "express",
                        "InstalledVersion": "4.17.1",
                        "FixedVersion": "4.18.2",
                        "Severity": "HIGH",
                        "Title": "...",
                        "Description": "...",
                        "PrimaryURL": "...",
                        "CVSS": {...}
                    }
                ]
            }
        ]
    }
    """
    findings = []

    if not isinstance(output, dict):
        logger.warning("Unexpected Trivy output format")
        return findings

    results = output.get("Results", [])

    for result in results:
        target_file = result.get("Target", "")
        pkg_type = result.get("Type", "")
        vulnerabilities = result.get("Vulnerabilities") or []

        for vuln in vulnerabilities:
            try:
                severity_str = vuln.get("Severity", "UNKNOWN")
                severity = SEVERITY_MAP.get(severity_str, Severity.INFO)

                # Extract CVSS score
                cvss_score = None
                cvss_data = vuln.get("CVSS", {})
                if cvss_data:
                    # Try to get NVD score first, then any available
                    for source in ["nvd", "ghsa", "redhat"]:
                        if source in cvss_data:
                            cvss_score = cvss_data[source].get("V3Score")
                            if cvss_score:
                                break

                finding = {
                    "severity": severity,
                    "title": vuln.get("Title", vuln.get("VulnerabilityID", "Unknown CVE")),
                    "description": vuln.get("Description", ""),
                    "file_path": target_file,
                    "line_start": None,
                    "line_end": None,
                    "code_snippet": None,
                    "rule_id": None,
                    "cve_id": vuln.get("VulnerabilityID", ""),
                    "cvss_score": cvss_score,
                    "package_name": vuln.get("PkgName", ""),
                    "package_version": vuln.get("InstalledVersion", ""),
                    "fixed_version": vuln.get("FixedVersion", ""),
                    "detector_type": "trivy",
                    "metadata_json": {
                        "primary_url": vuln.get("PrimaryURL", ""),
                        "references": vuln.get("References", []),
                        "pkg_type": pkg_type,
                        "data_source": vuln.get("DataSource", {}),
                        "published_date": vuln.get("PublishedDate", ""),
                        "last_modified": vuln.get("LastModifiedDate", ""),
                        "status": vuln.get("Status", ""),
                    },
                }

                findings.append(finding)

            except Exception as e:
                logger.warning(f"Failed to parse Trivy vulnerability: {e}")
                continue

    logger.info(f"Parsed {len(findings)} findings from Trivy output")
    return findings
