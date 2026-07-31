import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_create_scan_unauthorized(async_client: AsyncClient):
    response = await async_client.post("/api/scans", json={
        "project_id": "123e4567-e89b-12d3-a456-426614174000",
        "scan_types": ["sast"]
    })
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_get_scan_status_unauthorized(async_client: AsyncClient):
    response = await async_client.get("/api/scans/123")
    assert response.status_code == 401
