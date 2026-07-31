import pytest
from pydantic import ValidationError
from schemas.auth import UserCreate

def test_user_create_valid():
    data = {
        "email": "test@example.com",
        "username": "testuser",
        "password": "StrongPassword123"
    }
    user = UserCreate(**data)
    assert user.email == "test@example.com"
    assert user.username == "testuser"

def test_user_create_invalid_email():
    data = {
        "email": "invalid-email",
        "username": "testuser",
        "password": "StrongPassword123"
    }
    with pytest.raises(ValidationError) as exc:
        UserCreate(**data)
    assert "Invalid email format" in str(exc.value)

def test_user_create_invalid_username():
    data = {
        "email": "test@example.com",
        "username": "test user invalid",
        "password": "StrongPassword123"
    }
    with pytest.raises(ValidationError) as exc:
        UserCreate(**data)
    assert "Username must contain only letters" in str(exc.value)

def test_user_create_weak_password():
    data = {
        "email": "test@example.com",
        "username": "testuser",
        "password": "weak"
    }
    with pytest.raises(ValidationError) as exc:
        UserCreate(**data)
    assert "String should have at least 8 characters" in str(exc.value)
