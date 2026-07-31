import pytest
from models.finding import Severity
from services.parsers.bandit_parser import parse_bandit_results

def test_parse_bandit_results():
    mock_output = {
        "results": [
            {
                "code": "print('hello')",
                "filename": "/src/main.py",
                "issue_confidence": "HIGH",
                "issue_cwe": {"id": 22, "link": "https://cwe.mitre.org/data/definitions/22.html"},
                "issue_severity": "HIGH",
                "issue_text": "Possible directory traversal",
                "line_number": 10,
                "more_info": "https://bandit.readthedocs.io/",
                "test_id": "B101",
                "test_name": "assert_used"
            }
        ]
    }
    
    findings = parse_bandit_results(mock_output)
    
    assert len(findings) == 1
    finding = findings[0]
    assert finding["severity"] == Severity.HIGH
    assert finding["file_path"] == "main.py"
    assert finding["line_start"] == 10
    assert "B101" in finding["title"]
    assert "CWE-22" in finding["metadata_json"]["cwe"]

def test_parse_bandit_results_empty():
    findings = parse_bandit_results({"results": []})
    assert len(findings) == 0

def test_parse_bandit_results_invalid():
    findings = parse_bandit_results([])
    assert len(findings) == 0
