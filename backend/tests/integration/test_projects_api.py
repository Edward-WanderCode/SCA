import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_create_project_unauthorized(async_client: AsyncClient):
    response = await async_client.post("/api/projects", json={
        "name": "Test Project",
        "repo_url": "https://github.com/example/repo"
    })
    # Assuming endpoints are protected
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_get_projects_unauthorized(async_client: AsyncClient):
    response = await async_client.get("/api/projects")
    assert response.status_code == 401
