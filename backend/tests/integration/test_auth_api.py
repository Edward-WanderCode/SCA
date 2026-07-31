import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_login_invalid_credentials(async_client: AsyncClient):
    response = await async_client.post("/api/auth/login", data={
        "username": "wronguser",
        "password": "wrongpassword"
    })
    assert response.status_code == 401
    assert "detail" in response.json()

@pytest.mark.asyncio
async def test_register_user(async_client: AsyncClient):
    # Mock behavior for registration
    pass
