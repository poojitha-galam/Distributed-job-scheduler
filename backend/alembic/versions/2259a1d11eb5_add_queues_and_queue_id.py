"""Add queues and queue_id

Revision ID: 2259a1d11eb5
Revises: fb2bd4ab86cf
Create Date: 2026-08-24 19:15:00.000000

"""
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '2259a1d11eb5'
down_revision: Union[str, None] = 'fb2bd4ab86cf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create queues table
    op.create_table(
        'queues',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('priority', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('concurrency_limit', sa.Integer(), nullable=False, server_default='10'),
        sa.Column('paused', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('retry_policy', sa.String(), nullable=False, server_default="'exponential'"),
        sa.Column('max_attempts', sa.Integer(), nullable=False, server_default='3'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )

    # 2. Insert default queue
    op.execute(
        "INSERT INTO queues (id, name, priority, concurrency_limit, paused, retry_policy, max_attempts, created_at, updated_at) "
        "VALUES (gen_random_uuid(), 'default', 0, 10, false, 'exponential', 3, NOW(), NOW())"
    )

    # 3. Add queue_id to jobs and scheduled_jobs
    op.add_column('jobs', sa.Column('queue_id', sa.UUID(), nullable=True))
    op.add_column('scheduled_jobs', sa.Column('queue_id', sa.UUID(), nullable=True))

    # 4. Create foreign keys and indexes
    op.create_index('ix_jobs_queue_id', 'jobs', ['queue_id'], unique=False)
    op.create_foreign_key('fk_jobs_queue_id', 'jobs', 'queues', ['queue_id'], ['id'])
    op.create_foreign_key('fk_scheduled_jobs_queue_id', 'scheduled_jobs', 'queues', ['queue_id'], ['id'])

    # 5. Backfill queue_id for existing jobs
    op.execute(
        "UPDATE jobs SET queue_id = (SELECT id FROM queues WHERE name = 'default')"
    )
    op.execute(
        "UPDATE scheduled_jobs SET queue_id = (SELECT id FROM queues WHERE name = 'default')"
    )


def downgrade() -> None:
    op.drop_constraint('fk_scheduled_jobs_queue_id', 'scheduled_jobs', type_='foreignkey')
    op.drop_constraint('fk_jobs_queue_id', 'jobs', type_='foreignkey')
    op.drop_index('ix_jobs_queue_id', table_name='jobs')
    op.drop_column('scheduled_jobs', 'queue_id')
    op.drop_column('jobs', 'queue_id')
    op.drop_table('queues')
