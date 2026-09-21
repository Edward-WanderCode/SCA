"""Add uploaded_files table for Telegram ZIP uploads

Revision ID: a1b2c3d4e5f6
Revises: 93d88eec46b1
Create Date: 2026-09-21 10:00:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '93d88eec46b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'uploaded_files',
        sa.Column('id', postgresql.UUID(as_uuid=False), nullable=False),
        sa.Column('file_name', sa.String(length=255), nullable=False),
        sa.Column('telegram_file_id', sa.String(length=255), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_uploaded_files_file_name'), 'uploaded_files', ['file_name'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_uploaded_files_file_name'), table_name='uploaded_files')
    op.drop_table('uploaded_files')
