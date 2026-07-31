import pytest
from models.finding import Severity
from services.parsers.gosec_parser import parse_gosec_results

def test_parse_gosec_results():
    mock_output = {
        "Issues": [
            {
                "severity": "HIGH",
                "confidence": "HIGH",
                "cwe": {"id": "89", "url": "https://cwe.mitre.org/data/definitions/89.html"},
                "rule_id": "G201",
                "details": "SQL injection vulnerability",
                "file": "/src/database/db.go",
                "code": "db.Query(query)",
                "line": "42"
            }
        ]
    }
    
    findings = parse_gosec_results(mock_output)
    
    assert len(findings) == 1
    finding = findings[0]
    assert finding["severity"] == Severity.HIGH
    assert finding["file_path"] == "database/db.go"
    assert finding["line_start"] == 42
    assert "G201" in finding["title"]
    assert "CWE-89" in finding["metadata_json"]["cwe"]

def test_parse_gosec_results_empty():
    findings = parse_gosec_results({"Issues": []})
    assert len(findings) == 0

def test_parse_gosec_results_invalid():
    findings = parse_gosec_results([])
    assert len(findings) == 0
