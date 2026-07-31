import pytest
from models.finding import Finding, Severity

def test_finding_model_instantiation():
    finding = Finding(
        scan_id="123e4567-e89b-12d3-a456-426614174001",
        severity=Severity.HIGH,
        title="SQL Injection",
        file_path="src/main.py",
        line_start=10
    )
    
    assert finding.scan_id == "123e4567-e89b-12d3-a456-426614174001"
    assert finding.severity == Severity.HIGH
    assert finding.title == "SQL Injection"
    assert finding.file_path == "src/main.py"
    assert finding.line_start == 10
