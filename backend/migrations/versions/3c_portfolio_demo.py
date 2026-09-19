"""Isolate temporary portfolio workspaces without changing existing records."""

from alembic import op
import sqlalchemy as sa

revision = "3c_portfolio_demo"
down_revision = "2b_it_workflow"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "demo_workspaces",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("mutations", sa.Integer(), server_default="0", nullable=False),
    )
    op.create_index("ix_demo_workspaces_expires_at", "demo_workspaces", ["expires_at"])
    for table in ("users", "work_orders"):
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column("demo_workspace_id", sa.String(32), nullable=True))
            batch.create_foreign_key(f"fk_{table}_demo_workspace", "demo_workspaces", ["demo_workspace_id"], ["id"])
            batch.create_index(f"ix_{table}_demo_workspace_id", ["demo_workspace_id"])


def downgrade():
    raise RuntimeError("Restore a pre-upgrade backup with its matching application version.")
