#!/usr/bin/env python3
"""
Script to create initial admin user for SCA Platform.
Run this after first deployment or database initialization.

Usage:
    python scripts/create_admin.py
    
Or with custom credentials:
    python scripts/create_admin.py --email admin@example.com --username admin --password SecurePass123!
"""

import asyncio
import argparse
import sys
from pathlib import Path

# Add backend to Python path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from db.session import async_session_factory
from models.user import User, UserRole
from core.security import get_password_hash


async def create_admin_user(
    email: str,
    username: str,
    password: str,
    full_name: str = "System Administrator"
):
    """Create an admin user in the database."""
    async with async_session_factory() as session:
        # Check if admin already exists
        result = await session.execute(
            select(User).where(User.email == email)
        )
        existing_user = result.scalar_one_or_none()
        
        if existing_user:
            print(f"❌ User with email '{email}' already exists!")
            return False
        
        # Check if username is taken
        result = await session.execute(
            select(User).where(User.username == username)
        )
        existing_username = result.scalar_one_or_none()
        
        if existing_username:
            print(f"❌ Username '{username}' is already taken!")
            return False
        
        # Create admin user
        admin = User(
            email=email,
            username=username,
            hashed_password=get_password_hash(password),
            full_name=full_name,
            role=UserRole.ADMIN,
            is_active=True,
            is_superuser=True,
        )
        
        session.add(admin)
        await session.commit()
        await session.refresh(admin)
        
        print("\n" + "="*60)
        print("✅ Admin user created successfully!")
        print("="*60)
        print(f"📧 Email:    {admin.email}")
        print(f"👤 Username: {admin.username}")
        print(f"🔑 Password: {password}")
        print(f"🎭 Role:     {admin.role.value}")
        print(f"🆔 ID:       {admin.id}")
        print("="*60)
        print("\n⚠️  IMPORTANT: Please change the password after first login!")
        print("\n")
        
        return True


async def main():
    parser = argparse.ArgumentParser(
        description="Create initial admin user for SCA Platform"
    )
    parser.add_argument(
        "--email",
        default="admin@sca-platform.local",
        help="Admin email address (default: admin@sca-platform.local)"
    )
    parser.add_argument(
        "--username",
        default="admin",
        help="Admin username (default: admin)"
    )
    parser.add_argument(
        "--password",
        default="Admin123!Change",
        help="Admin password (default: Admin123!Change)"
    )
    parser.add_argument(
        "--full-name",
        default="System Administrator",
        help="Admin full name (default: System Administrator)"
    )
    
    args = parser.parse_args()
    
    print("\n🚀 SCA Platform - Admin User Creation")
    print("="*60)
    
    try:
        success = await create_admin_user(
            email=args.email,
            username=args.username,
            password=args.password,
            full_name=args.full_name
        )
        
        if success:
            sys.exit(0)
        else:
            sys.exit(1)
            
    except Exception as e:
        print(f"\n❌ Error creating admin user: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
