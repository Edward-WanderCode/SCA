"""Initial schema with users table

Revision ID: 001
Revises: None
Create Date: 2026-07-31

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # === Users Table ===
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column('email', sa.String(320), nullable=False),
        sa.Column('username', sa.String(150), nullable=False),
        sa.Column('hashed_password', sa.String(255), nullable=False),
        sa.Column('full_name', sa.String(255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('is_superuser', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('role', sa.Enum('admin', 'analyst', 'viewer', name='userrole'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_users')),
        sa.UniqueConstraint('email', name=op.f('uq_users_email')),
        sa.UniqueConstraint('username', name=op.f('uq_users_username')),
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_username'), 'users', ['username'], unique=True)

    # === Performance Indexes for existing tables ===
    # These use IF NOT EXISTS pattern via try/except to be safe
    # against tables that may already have these indexes

    # Projects indexes
    try:
        op.create_index('ix_projects_name', 'projects', ['name'], unique=False, if_not_exists=True)
    except Exception:
        pass

    # Scans indexes
    try:
        op.create_index('ix_scans_status', 'scans', ['status'], unique=False, if_not_exists=True)
    except Exception:
        pass
    try:
        op.create_index('ix_scans_project_id', 'scans', ['project_id'], unique=False, if_not_exists=True)
    except Exception:
        pass
    try:
        op.create_index('ix_scans_project_id_created_at', 'scans', ['project_id', 'created_at'], unique=False, if_not_exists=True)
    except Exception:
        pass

    # Findings indexes
    try:
        op.create_index('ix_findings_severity', 'findings', ['severity'], unique=False, if_not_exists=True)
    except Exception:
        pass
    try:
        op.create_index('ix_findings_scan_id', 'findings', ['scan_id'], unique=False, if_not_exists=True)
    except Exception:
        pass
    try:
        op.create_index('ix_findings_rule_id', 'findings', ['rule_id'], unique=False, if_not_exists=True)
    except Exception:
        pass
    try:
        op.create_index('ix_findings_cve_id', 'findings', ['cve_id'], unique=False, if_not_exists=True)
    except Exception:
        pass


def downgrade() -> None:
    # Drop performance indexes
    op.drop_index('ix_findings_cve_id', table_name='findings', if_exists=True)
    op.drop_index('ix_findings_rule_id', table_name='findings', if_exists=True)
    op.drop_index('ix_findings_scan_id', table_name='findings', if_exists=True)
    op.drop_index('ix_findings_severity', table_name='findings', if_exists=True)
    op.drop_index('ix_scans_project_id_created_at', table_name='scans', if_exists=True)
    op.drop_index('ix_scans_project_id', table_name='scans', if_exists=True)
    op.drop_index('ix_scans_status', table_name='scans', if_exists=True)
    op.drop_index('ix_projects_name', table_name='projects', if_exists=True)

    # Drop users table
    op.drop_index(op.f('ix_users_username'), table_name='users')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
    op.execute("DROP TYPE IF EXISTS userrole")
