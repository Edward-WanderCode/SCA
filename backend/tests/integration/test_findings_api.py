import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_get_findings_unauthorized(async_client: AsyncClient):
    response = await async_client.get("/api/findings", params={"scan_id": "123"})
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_get_findings_summary_unauthorized(async_client: AsyncClient):
    response = await async_client.get("/api/findings/summary")
    assert response.status_code == 401
