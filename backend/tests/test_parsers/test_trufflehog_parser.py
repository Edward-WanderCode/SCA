import pytest
from models.finding import Severity
from services.parsers.trufflehog_parser import parse_trufflehog_results

def test_parse_trufflehog_results_verified():
    mock_results = [
        {
            "SourceMetadata": {
                "Data": {
                    "Filesystem": {
                        "file": "config.yml",
                        "line": 42
                    }
                }
            },
            "DetectorName": "AWS",
            "Verified": True,
            "Redacted": "AKIA...MPLE",
            "ExtraData": {
                "account": "123456789"
            }
        }
    ]
    
    findings = parse_trufflehog_results(mock_results)
    
    assert len(findings) == 1
    finding = findings[0]
    assert finding["severity"] == Severity.CRITICAL
    assert finding["title"] == "Verified AWS Secret Detected"
    assert "Verified - this secret is active!" in finding["description"]
    assert finding["file_path"] == "config.yml"
    assert finding["line_start"] == 42
    assert finding["code_snippet"] == "AKIA...MPLE"
    assert finding["rule_id"] == "trufflehog-aws"
    assert finding["verified"] is True
    assert finding["metadata_json"]["extra_data"]["account"] == "123456789"

def test_parse_trufflehog_results_unverified():
    mock_results = [
        {
            "SourceMetadata": {
                "Data": {
                    "Git": {
                        "file": "src/main.py",
                        "line": 15
                    }
                }
            },
            "DetectorName": "Slack",
            "Verified": False,
            "Redacted": "xoxb-...-..."
        }
    ]
    
    findings = parse_trufflehog_results(mock_results)
    
    assert len(findings) == 1
    finding = findings[0]
    assert finding["severity"] == Severity.HIGH
    assert finding["title"] == "Unverified Slack Secret Detected"
    assert "Unverified - manual review recommended." in finding["description"]
    assert finding["file_path"] == "src/main.py"
    assert finding["line_start"] == 15

def test_parse_trufflehog_results_empty():
    findings = parse_trufflehog_results([])
    assert len(findings) == 0

def test_parse_trufflehog_results_invalid_format():
    findings = parse_trufflehog_results([{"no_source": True}])
    assert len(findings) == 1
    assert findings[0]["severity"] == Severity.MEDIUM
    assert findings[0]["detector_type"] == "Generic"
