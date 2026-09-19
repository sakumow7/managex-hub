"""Explicit, idempotent seed command. Never run automatically in production."""

import os
from datetime import timedelta

from sqlalchemy import select

from .db import SessionLocal
from .models import AuditEvent, User, WorkOrder, utcnow
from .security import passwords


def seed():
    password = os.environ.get("DEMO_PASSWORD")
    if not password or len(password) < 12:
        raise SystemExit("Set DEMO_PASSWORD to at least 12 characters before seeding.")
    with SessionLocal() as db:
        if db.scalar(select(User).limit(1)):
            print("Database already contains users; no sample data added.")
            return
        accounts = {}
        for role, name in [
            ("requester", "Alex Morgan"),
            ("technician", "Jordan Ellis"),
            ("supervisor", "Taylor Reed"),
            ("administrator", "Casey Brooks"),
        ]:
            account = User(email=f"{role}@example.com", name=name, role=role, password_hash=passwords.hash(password))
            db.add(account)
            db.flush()
            accounts[role] = account
        samples = [
            ("Air handler making unusual noise", "HVAC", "high", "in_progress", "North workshop", -1, "maintenance"),
            ("Quarterly safety walk-through", "Safety", "medium", "assigned", "Community center", 2, "inspection"),
            ("Dripping faucet in break room", "Plumbing", "low", "submitted", "South studio", 5, "maintenance"),
            ("Replace corridor light fixture", "Electrical", "medium", "completed", "North workshop", 1, "maintenance"),
            ("Check cooling system filters", "HVAC", "high", "submitted", "East library", 3, "inspection"),
            ("Inspect emergency exit signage", "Safety", "medium", "closed", "Community center", -3, "inspection"),
        ]
        for index, (title, category, priority, status, location, due_days, kind) in enumerate(samples):
            created = utcnow() - timedelta(days=8 + index)
            order = WorkOrder(
                title=title,
                description="Fictional demonstration request. Inspect the sample issue and record observations; no real facility or government data.",
                location=location,
                category=category,
                priority=priority,
                status=status,
                kind=kind,
                requester_id=accounts["requester"].id,
                assignee_id=accounts["technician"].id if status != "submitted" else None,
                due_at=utcnow() + timedelta(days=due_days),
                created_at=created,
                closed_at=created + timedelta(days=4) if status == "closed" else None,
            )
            db.add(order)
            db.flush()
            db.add(
                AuditEvent(
                    work_order_id=order.id,
                    actor_id=accounts["administrator"].id,
                    action="seeded",
                    detail=f"Sample imported with status: {status}",
                    created_at=created,
                )
            )
        db.commit()
    print("Created four demo users and six fictional work orders.")


if __name__ == "__main__":
    seed()
