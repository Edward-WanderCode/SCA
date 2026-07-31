import pytest
from models.finding import Severity
from services.parsers.opengrep_parser import parse_opengrep_results

def test_parse_opengrep_results():
    mock_output = {
        "results": [
            {
                "check_id": "python.flask.security.injection",
                "path": "app.py",
                "start": {"line": 10, "col": 1},
                "end": {"line": 12, "col": 50},
                "extra": {
                    "message": "Potential SQL injection",
                    "severity": "WARNING",
                    "lines": "query = 'SELECT * FROM users WHERE id = ' + user_id",
                    "metadata": {
                        "cve": "CVE-2023-9999",
                        "category": "security",
                        "cwe": ["CWE-89"]
                    }
                }
            }
        ]
    }
    
    findings = parse_opengrep_results(mock_output)
    
    assert len(findings) == 1
    finding = findings[0]
    assert finding["severity"] == Severity.HIGH
    assert finding["title"] == "python.flask.security.injection"
    assert finding["description"] == "Potential SQL injection"
    assert finding["file_path"] == "app.py"
    assert finding["line_start"] == 10
    assert finding["line_end"] == 12
    assert finding["code_snippet"] == "query = 'SELECT * FROM users WHERE id = ' + user_id"
    assert finding["rule_id"] == "python.flask.security.injection"
    assert finding["cve_id"] == "CVE-2023-9999"
    assert finding["metadata_json"]["cwe"] == ["CWE-89"]
    assert finding["metadata_json"]["category"] == "security"

def test_parse_opengrep_results_empty():
    findings = parse_opengrep_results({"results": []})
    assert len(findings) == 0

def test_parse_opengrep_results_invalid_format():
    findings = parse_opengrep_results("not a dictionary or list")
    assert len(findings) == 0

def test_parse_opengrep_results_list_format():
    mock_output = [
        {
            "check_id": "test-rule",
            "path": "test.py",
            "extra": {
                "severity": "ERROR"
            }
        }
    ]
    findings = parse_opengrep_results(mock_output)
    assert len(findings) == 1
    assert findings[0]["severity"] == Severity.CRITICAL
