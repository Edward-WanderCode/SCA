"""TruffleHog secret detection scanner output parser."""

import logging
from models.finding import Severity

logger = logging.getLogger(__name__)

# Map detector types to severity
# Verified secrets are always CRITICAL; unverified are HIGH
DETECTOR_SEVERITY = {
    "AWS": Severity.CRITICAL,
    "GCP": Severity.CRITICAL,
    "Azure": Severity.CRITICAL,
    "GitHub": Severity.CRITICAL,
    "GitLab": Severity.CRITICAL,
    "Slack": Severity.HIGH,
    "Stripe": Severity.CRITICAL,
    "PrivateKey": Severity.CRITICAL,
    "Generic": Severity.MEDIUM,
}


def parse_trufflehog_results(results: list[dict]) -> list[dict]:
    """
    Parse TruffleHog JSON stream output into normalized finding records.

    TruffleHog outputs NDJSON (one JSON object per line):
    {
        "SourceMetadata": {
            "Data": {
                "Filesystem": {
                    "file": "path/to/file",
                    "line": 42
                }
            }
        },
        "SourceID": 0,
        "SourceType": 15,
        "SourceName": "trufflehog - filesystem",
        "DetectorType": 17,
        "DetectorName": "AWS",
        "DecoderName": "PLAIN",
        "Verified": false,
        "Raw": "AKIAIOSFODNN7EXAMPLE",
        "RawV2": "...",
        "Redacted": "AKIA...MPLE",
        "ExtraData": {
            "account": "...",
            "arn": "...",
        },
        "StructuredData": null
    }
    """
    findings = []

    for result in results:
        try:
            # Extract source metadata
            source_meta = result.get("SourceMetadata", {}).get("Data", {})
            filesystem_meta = source_meta.get("Filesystem", {})
            git_meta = source_meta.get("Git", {})

            # Determine file path and line
            file_path = (
                filesystem_meta.get("file", "")
                or git_meta.get("file", "")
                or ""
            )
            line = (
                filesystem_meta.get("line")
                or git_meta.get("line")
            )

            # Determine severity
            detector_name = result.get("DetectorName", "Generic")
            verified = result.get("Verified", False)

            if verified:
                severity = Severity.CRITICAL
            else:
                severity = DETECTOR_SEVERITY.get(detector_name, Severity.HIGH)

            # Build descriptive title
            verification_status = "Verified" if verified else "Unverified"
            title = f"{verification_status} {detector_name} Secret Detected"

            # Build description
            redacted = result.get("Redacted", "")
            description = (
                f"A {detector_name.lower()} secret was detected in the codebase. "
                f"Redacted value: {redacted}. "
                f"Verification status: {'Verified - this secret is active!' if verified else 'Unverified - manual review recommended.'}."
            )

            finding = {
                "severity": severity,
                "title": title,
                "description": description,
                "file_path": file_path,
                "line_start": line,
                "line_end": line,
                "code_snippet": result.get("Redacted", ""),
                "rule_id": f"trufflehog-{detector_name.lower()}",
                "detector_type": detector_name,
                "verified": verified,
                "metadata_json": {
                    "detector_type_id": result.get("DetectorType"),
                    "decoder_name": result.get("DecoderName", ""),
                    "source_type": result.get("SourceType"),
                    "source_name": result.get("SourceName", ""),
                    "extra_data": result.get("ExtraData", {}),
                    "redacted": redacted,
                    "commit": git_meta.get("commit", ""),
                    "email": git_meta.get("email", ""),
                    "timestamp": git_meta.get("timestamp", ""),
                },
            }

            findings.append(finding)

        except Exception as e:
            logger.warning(f"Failed to parse TruffleHog result: {e}")
            continue

    logger.info(f"Parsed {len(findings)} findings from TruffleHog output")
    return findings
