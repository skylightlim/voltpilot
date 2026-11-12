"""result_timings: seconds from opening the interview to seeing the result

Revision ID: 8d3f1b6a2c90
Revises: 5c1e8a2d9b47
Create Date: 2026-11-12 20:30:00
"""
from alembic import op
import sqlalchemy as sa


revision = '8d3f1b6a2c90'
down_revision = '5c1e8a2d9b47'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('result_timings',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('result_token', sa.String(length=40), nullable=False),
    sa.Column('seconds', sa.Float(), nullable=False),
    sa.Column('via', sa.String(length=10), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_result_timings_result_token'), 'result_timings', ['result_token'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_result_timings_result_token'), table_name='result_timings')
    op.drop_table('result_timings')
