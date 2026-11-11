"""mind_changes: the results page's "did this change your mind?" answers

Revision ID: 5c1e8a2d9b47
Revises: 27a6d6aef384
Create Date: 2026-11-11 21:30:00
"""
from alembic import op
import sqlalchemy as sa


revision = '5c1e8a2d9b47'
down_revision = '27a6d6aef384'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('mind_changes',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('result_token', sa.String(length=40), nullable=False),
    sa.Column('leaning_before', sa.String(length=10), nullable=True),
    sa.Column('leaning_after', sa.String(length=10), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_mind_changes_result_token'), 'mind_changes', ['result_token'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_mind_changes_result_token'), table_name='mind_changes')
    op.drop_table('mind_changes')
