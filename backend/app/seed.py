"""Add fictional IT scenarios once, preserving existing accounts and records."""

import os
from datetime import timedelta
from sqlalchemy import select
from .db import SessionLocal
from .models import AuditEvent, Comment, TicketLink, User, WorkOrder, utcnow
from .security import passwords


def seed():
    password = os.environ.get("DEMO_PASSWORD")
    if not password or len(password) < 12:
        raise SystemExit("Set DEMO_PASSWORD to at least 12 characters.")
    with SessionLocal() as db:
        accounts = {}
        for email, name, role, team in [
            ("requester", "Alex Morgan", "requester", "cst"),
            ("technician", "Jordan Ellis", "technician", "cst"),
            ("supervisor", "Taylor Reed", "supervisor", "cst"),
            ("administrator", "Casey Brooks", "administrator", "it_operations"),
            ("cyber", "Morgan Chen", "technician", "cybersecurity"),
            ("developer", "Sam Rivera", "technician", "development"),
            ("operations", "Jamie Park", "technician", "it_operations"),
        ]:
            account = db.scalar(select(User).where(User.email == f"{email}@example.com"))
            if not account:
                account = User(
                    email=f"{email}@example.com",
                    name=name,
                    role=role,
                    team=team,
                    password_hash=passwords.hash(password),
                )
                db.add(account)
                db.flush()
            accounts[email] = account
        if db.scalar(select(AuditEvent).where(AuditEvent.action == "seed_it").limit(1)):
            db.commit()
            print("IT sample scenarios already exist; existing records were preserved.")
            return
        samples = [
            (
                "VPN disconnects after sign-in",
                "Network",
                "high",
                "in_progress",
                "DEMO-LAPTOP-01",
                -1,
                "support",
                "cst",
                "technician",
            ),
            (
                "Shared printer unavailable",
                "Hardware",
                "medium",
                "submitted",
                "DEMO-PRINT-01",
                1,
                "support",
                "cst",
                None,
            ),
            (
                "Request access to test application",
                "Access",
                "medium",
                "assigned",
                "Demo portal",
                2,
                "access_request",
                "cst",
                "technician",
            ),
            (
                "Demo portal shows an error on save",
                "Software",
                "high",
                "blocked",
                "Demo portal",
                1,
                "support",
                "cst",
                "technician",
            ),
            (
                "Investigate save validation bug",
                "Software",
                "high",
                "assigned",
                "Demo portal",
                2,
                "bug",
                "development",
                "developer",
            ),
            (
                "Review simulated phishing report",
                "Security",
                "high",
                "assigned",
                "Fictional message",
                1,
                "security",
                "cybersecurity",
                "cyber",
            ),
            (
                "Plan test workstation patch rollout",
                "Systems",
                "medium",
                "submitted",
                "Lab workstations",
                5,
                "change",
                "it_operations",
                None,
            ),
            (
                "Restore demo display settings",
                "Hardware",
                "low",
                "completed",
                "DEMO-LAPTOP-02",
                3,
                "support",
                "cst",
                "technician",
            ),
        ]
        tickets = []
        for index, (title, category, priority, status, location, days, kind, team, agent) in enumerate(samples):
            ticket = WorkOrder(
                title=title,
                description="Fictional IT evaluation scenario. Use sample observations only; no actual device identifiers, credentials, or workplace information.",
                location=location,
                category=category,
                priority=priority,
                status=status,
                kind=kind,
                team=team,
                restricted=team == "cybersecurity",
                requester_id=accounts["requester" if team == "cst" else "technician"].id,
                assignee_id=accounts[agent].id if agent else None,
                due_at=utcnow() + timedelta(days=days),
                created_at=utcnow() - timedelta(days=index + 1),
            )
            db.add(ticket)
            db.flush()
            db.add(
                AuditEvent(
                    work_order_id=ticket.id,
                    actor_id=accounts["administrator"].id,
                    action="seed_it",
                    detail=f"Fictional IT scenario created with status: {status}",
                )
            )
            tickets.append(ticket)
        db.add(TicketLink(source_id=tickets[3].id, target_id=tickets[4].id))
        db.add(
            Comment(
                work_order_id=tickets[3].id,
                author_id=accounts["technician"].id,
                body="We reproduced the sample issue and are working with the development team.",
                internal=False,
            )
        )
        db.add(
            Comment(
                work_order_id=tickets[3].id,
                author_id=accounts["technician"].id,
                body="Internal sample note: check the validation handler in the demo environment.",
                internal=True,
            )
        )
        db.commit()
    print("IT demo accounts and eight fictional scenarios are ready. Existing records were preserved.")


if __name__ == "__main__":
    seed()
