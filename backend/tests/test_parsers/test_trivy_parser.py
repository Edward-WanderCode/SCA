import pytest
from models.finding import Severity
from services.parsers.trivy_parser import parse_trivy_results

def test_parse_trivy_results_with_vulnerabilities():
    mock_output = {
        "Results": [{
            "Target": "package-lock.json",
            "Type": "npm",
            "Vulnerabilities": [{
                "VulnerabilityID": "CVE-2023-12345",
                "Severity": "HIGH",
                "PkgName": "requests",
                "InstalledVersion": "2.28.0",
                "FixedVersion": "2.31.0",
                "Title": "Test Vulnerability",
                "Description": "A test vulnerability description",
                "PrimaryURL": "https://example.com/cve-2023-12345",
                "CVSS": {
                    "nvd": {
                        "V3Score": 8.5
                    }
                }
            }]
        }]
    }
    
    findings = parse_trivy_results(mock_output)
    
    assert len(findings) == 1
    finding = findings[0]
    assert finding["severity"] == Severity.HIGH
    assert finding["cve_id"] == "CVE-2023-12345"
    assert finding["package_name"] == "requests"
    assert finding["package_version"] == "2.28.0"
    assert finding["fixed_version"] == "2.31.0"
    assert finding["title"] == "Test Vulnerability"
    assert finding["description"] == "A test vulnerability description"
    assert finding["cvss_score"] == 8.5
    assert finding["metadata_json"]["primary_url"] == "https://example.com/cve-2023-12345"
    assert finding["metadata_json"]["pkg_type"] == "npm"
    assert finding["file_path"] == "package-lock.json"

def test_parse_trivy_results_empty():
    findings = parse_trivy_results({"Results": []})
    assert len(findings) == 0

def test_parse_trivy_results_invalid_format():
    findings = parse_trivy_results("not a dictionary")
    assert len(findings) == 0

def test_parse_trivy_results_no_vulnerabilities():
    mock_output = {
        "Results": [{
            "Target": "package-lock.json",
            "Type": "npm"
        }]
    }
    findings = parse_trivy_results(mock_output)
    assert len(findings) == 0
