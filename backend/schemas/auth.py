"""Authentication schemas for request/response validation."""

import re
from datetime import datetime
from pydantic import BaseModel, Field, field_validator, model_validator
from models.user import UserRole


class UserCreate(BaseModel):
    """Schema for user registration."""
    email: str = Field(..., min_length=5, max_length=320, description="User email address")
    username: str = Field(..., min_length=3, max_length=150, description="Username")
    password: str = Field(..., min_length=8, max_length=128, description="Password")
    full_name: str | None = Field(None, max_length=255, description="Full name")

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
        if not re.match(pattern, v):
            raise ValueError("Invalid email format")
        return v.lower().strip()

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        if not re.match(r"^[a-zA-Z0-9_]+$", v):
            raise ValueError("Username must contain only letters, numbers, and underscores")
        return v.strip()

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        errors = []
        if len(v) < 8:
            errors.append("at least 8 characters")
        if not re.search(r"[A-Z]", v):
            errors.append("an uppercase letter")
        if not re.search(r"[a-z]", v):
            errors.append("a lowercase letter")
        if not re.search(r"[0-9]", v):
            errors.append("a number")
        if errors:
            raise ValueError(f"Password must contain {', '.join(errors)}")
        return v


class UserLogin(BaseModel):
    """Schema for user login."""
    username: str = Field(..., description="Username or email")
    password: str = Field(..., description="Password")


class Token(BaseModel):
    """Schema for JWT token response."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenRefresh(BaseModel):
    """Schema for token refresh request."""
    refresh_token: str


class TokenPayload(BaseModel):
    """Schema for decoded JWT token payload."""
    sub: str  # user ID
    exp: int  # expiration timestamp
    type: str  # "access" or "refresh"


class UserResponse(BaseModel):
    """Schema for user response (excludes password)."""
    id: str
    email: str
    username: str
    full_name: str | None = None
    is_active: bool = True
    role: UserRole
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    """Schema for updating user profile."""
    full_name: str | None = Field(None, max_length=255)
    email: str | None = Field(None, min_length=5, max_length=320)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str | None) -> str | None:
        if v is None:
            return v
        pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
        if not re.match(pattern, v):
            raise ValueError("Invalid email format")
        return v.lower().strip()


class PasswordChange(BaseModel):
    """Schema for changing password."""
    current_password: str = Field(..., description="Current password")
    new_password: str = Field(..., min_length=8, max_length=128, description="New password")

    @field_validator("new_password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        errors = []
        if len(v) < 8:
            errors.append("at least 8 characters")
        if not re.search(r"[A-Z]", v):
            errors.append("an uppercase letter")
        if not re.search(r"[a-z]", v):
            errors.append("a lowercase letter")
        if not re.search(r"[0-9]", v):
            errors.append("a number")
        if errors:
            raise ValueError(f"Password must contain {', '.join(errors)}")
        return v
