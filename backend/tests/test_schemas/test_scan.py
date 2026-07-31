import pytest
from pydantic import ValidationError
from schemas.scan import ScanCreate, FolderScanCreate
from models.scan import ScanType

def test_scan_create_valid():
    data = {
        "project_id": "123e4567-e89b-12d3-a456-426614174000",
        "scan_types": [ScanType.SAST, ScanType.SECRET]
    }
    scan = ScanCreate(**data)
    assert scan.project_id == "123e4567-e89b-12d3-a456-426614174000"
    assert len(scan.scan_types) == 2

def test_scan_create_invalid_scan_types():
    data = {
        "project_id": "123e4567-e89b-12d3-a456-426614174000",
        "scan_types": []
    }
    with pytest.raises(ValidationError):
        ScanCreate(**data)

def test_folder_scan_create_valid():
    data = {
        "folder_path": "/tmp/test",
        "scan_types": [ScanType.COMBINED]
    }
    scan = FolderScanCreate(**data)
    assert scan.folder_path == "/tmp/test"
    assert scan.scan_types == [ScanType.COMBINED]
