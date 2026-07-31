"""Authentication API routes."""

import logging
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from db.session import get_db
from models.user import User, UserRole
from schemas.auth import (
    UserCreate, UserLogin, Token, TokenRefresh,
    UserResponse, UserUpdate, PasswordChange,
)
from core.security import (
    get_password_hash, verify_password,
    create_access_token, create_refresh_token,
    verify_token, blacklist_token, is_token_blacklisted,
)
from core.rate_limit import limiter
from api.deps import get_current_active_user
from config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/register", response_model=UserResponse, status_code=201)
@limiter.limit("3/hour")
async def register(
    request: Request,
    data: UserCreate,
    db: AsyncSession = Depends(get_db),
):
    """Register a new user account."""
    # Check for existing user with same email or username
    existing_q = select(User).where(
        or_(User.email == data.email, User.username == data.username)
    )
    existing = (await db.execute(existing_q)).scalar_one_or_none()

    if existing:
        if existing.email == data.email:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A user with this email already exists",
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this username already exists",
        )

    # Create user with hashed password
    user = User(
        email=data.email,
        username=data.username,
        hashed_password=get_password_hash(data.password),
        full_name=data.full_name,
        role=UserRole.VIEWER,  # Default role for self-registration
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    logger.info(f"New user registered: {user.username} ({user.email})")

    return UserResponse.model_validate(user)


@router.post("/login", response_model=Token)
@limiter.limit("5/minute")
async def login(
    request: Request,
    data: UserLogin,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate user and return JWT tokens."""
    # Look up user by username or email
    user_q = select(User).where(
        or_(User.username == data.username, User.email == data.username)
    )
    user = (await db.execute(user_q)).scalar_one_or_none()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    # Generate tokens
    access_token = create_access_token(subject=user.id)
    refresh_token = create_refresh_token(subject=user.id)

    logger.info(f"User logged in: {user.username}")

    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
    )


@router.post("/refresh", response_model=Token)
async def refresh_token(
    data: TokenRefresh,
    db: AsyncSession = Depends(get_db),
):
    """Refresh access token using a refresh token."""
    payload = verify_token(data.refresh_token)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type. Use a refresh token.",
        )

    # Check blacklist
    if await is_token_blacklisted(data.refresh_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked",
        )

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    # Generate new tokens
    new_access_token = create_access_token(subject=user.id)
    new_refresh_token = create_refresh_token(subject=user.id)

    # Blacklist the old refresh token
    exp = payload.get("exp", 0)
    from datetime import datetime, timezone
    remaining = max(0, exp - int(datetime.now(timezone.utc).timestamp()))
    await blacklist_token(data.refresh_token, remaining)

    return Token(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
    )


@router.post("/logout", status_code=204)
async def logout(
    request: Request,
    current_user: User = Depends(get_current_active_user),
):
    """Logout by blacklisting the current access token."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        payload = verify_token(token)
        if payload:
            exp = payload.get("exp", 0)
            from datetime import datetime, timezone
            remaining = max(0, exp - int(datetime.now(timezone.utc).timestamp()))
            await blacklist_token(token, remaining)

    logger.info(f"User logged out: {current_user.username}")


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: User = Depends(get_current_active_user),
):
    """Get current authenticated user's profile."""
    return UserResponse.model_validate(current_user)


@router.put("/me", response_model=UserResponse)
async def update_current_user_profile(
    data: UserUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Update current user's profile."""
    update_data = data.model_dump(exclude_unset=True)

    # Check email uniqueness if changing email
    if "email" in update_data and update_data["email"] != current_user.email:
        existing = await db.execute(
            select(User).where(User.email == update_data["email"])
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A user with this email already exists",
            )

    for field, value in update_data.items():
        setattr(current_user, field, value)

    await db.flush()
    await db.refresh(current_user)

    return UserResponse.model_validate(current_user)


@router.post("/change-password", status_code=204)
async def change_password(
    data: PasswordChange,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Change the current user's password."""
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    current_user.hashed_password = get_password_hash(data.new_password)
    await db.flush()

    logger.info(f"Password changed for user: {current_user.username}")
