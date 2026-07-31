import pytest
from models.scan import Scan, ScanType, ScanStatus

def test_scan_model_instantiation():
    scan = Scan(
        project_id="123e4567-e89b-12d3-a456-426614174000",
        scan_type=ScanType.SAST,
        status=ScanStatus.PENDING
    )
    
    assert scan.project_id == "123e4567-e89b-12d3-a456-426614174000"
    assert scan.scan_type == ScanType.SAST
    assert scan.status == ScanStatus.PENDING
