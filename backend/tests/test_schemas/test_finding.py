import pytest
from schemas.finding import FindingFilters
from models.finding import Severity

def test_finding_filters_valid():
    data = {
        "severity": [Severity.CRITICAL, Severity.HIGH],
        "scan_type": "sast",
        "verified": True
    }
    filters = FindingFilters(**data)
    assert filters.severity == [Severity.CRITICAL, Severity.HIGH]
    assert filters.scan_type == "sast"
    assert filters.verified is True
    assert filters.rule_id is None

def test_finding_filters_empty():
    filters = FindingFilters()
    assert filters.severity is None
    assert filters.scan_type is None
    assert filters.search is None
