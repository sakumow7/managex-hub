"""Add IT queues, restricted tasks, comments, and linked tickets without deleting records."""

from alembic import op
import sqlalchemy as sa

revision = "2b_it_workflow"
down_revision = "1a0e87e0b7c5"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("team", sa.String(30), server_default="cst", nullable=False))
    op.add_column("work_orders", sa.Column("team", sa.String(30), server_default="cst", nullable=False))
    op.add_column("work_orders", sa.Column("restricted", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.create_index("ix_work_orders_team", "work_orders", ["team"])
    with op.batch_alter_table("notifications") as batch:
        batch.add_column(sa.Column("work_order_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_notifications_work_order_id", "work_orders", ["work_order_id"], ["id"])
        batch.create_index("ix_notifications_work_order_id", ["work_order_id"])
    op.create_table(
        "comments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("work_order_id", sa.Integer(), sa.ForeignKey("work_orders.id"), nullable=False),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("internal", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_comments_work_order_id", "comments", ["work_order_id"])
    op.create_table(
        "ticket_links",
        sa.Column("source_id", sa.Integer(), sa.ForeignKey("work_orders.id"), primary_key=True),
        sa.Column("target_id", sa.Integer(), sa.ForeignKey("work_orders.id"), primary_key=True),
    )


def downgrade():
    raise RuntimeError("Restore a pre-upgrade backup to revert this data-preserving migration.")
