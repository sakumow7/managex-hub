"""Bounded, expiring portfolio workspaces. No public administrator identity."""

from datetime import timedelta, timezone
from typing import Literal
from uuid import uuid4

import jwt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, func, or_, select, text
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import Attachment, AuditEvent, Comment, DemoWorkspace, Notification, TicketLink, User, WorkOrder, utcnow
from .security import DUMMY_HASH, create_token
from .seed import ACCOUNTS, seed_scenarios

router = APIRouter(prefix="/api/demo", tags=["Portfolio demo"])
Persona = Literal["requester", "technician", "supervisor", "cyber", "developer", "operations"]


class DemoStart(BaseModel):
    model_config = ConfigDict(extra="forbid")
    persona: Persona = "supervisor"


class DemoSwitch(DemoStart):
    session_token: str = Field(min_length=1, max_length=2000)


def require_demo():
    if not settings().demo_enabled:
        raise HTTPException(404, "Demo mode is not enabled")


def cleanup_expired(db):
    """Remove only expired sandbox data, in FK order. Called on new visits/startup."""
    # Coordinate creation, cleanup and total capacity across PostgreSQL workers.
    if db.bind.dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(73310429)"))
    expired = db.scalars(select(DemoWorkspace.id).where(DemoWorkspace.expires_at <= utcnow()).with_for_update()).all()
    if not expired:
        return
    ticket_ids = select(WorkOrder.id).where(WorkOrder.demo_workspace_id.in_(expired))
    user_ids = select(User.id).where(User.demo_workspace_id.in_(expired))
    db.execute(
        delete(TicketLink).where(or_(TicketLink.source_id.in_(ticket_ids), TicketLink.target_id.in_(ticket_ids)))
    )
    for model in (Attachment, AuditEvent, Comment):
        db.execute(delete(model).where(model.work_order_id.in_(ticket_ids)))
    db.execute(
        delete(Notification).where(or_(Notification.work_order_id.in_(ticket_ids), Notification.user_id.in_(user_ids)))
    )
    db.execute(delete(WorkOrder).where(WorkOrder.demo_workspace_id.in_(expired)))
    db.execute(delete(User).where(User.demo_workspace_id.in_(expired)))
    db.execute(delete(DemoWorkspace).where(DemoWorkspace.id.in_(expired)))


def response_for(db, workspace, persona):
    person = db.scalar(
        select(User).where(
            User.demo_workspace_id == workspace.id,
            User.email == f"{persona}.{workspace.id}@example.com",
        )
    )
    if person is None:
        raise HTTPException(401, "Demo identity unavailable. Start a new workspace.")
    expires = workspace.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    return {
        "access_token": create_token(person.id, workspace.id),
        "token_type": "bearer",
        "session_token": jwt.encode(
            {"workspace": workspace.id, "purpose": "demo-switch", "exp": expires},
            settings().jwt_secret,
            algorithm="HS256",
        ),
        "expires_at": expires,
        "persona": persona,
    }


@router.post("/sessions", status_code=201, dependencies=[Depends(require_demo)])
def start_demo(data: DemoStart, db: Session = Depends(get_db)):
    cleanup_expired(db)
    count = db.scalar(select(func.count()).select_from(DemoWorkspace))
    if count >= settings().demo_max_workspaces:
        raise HTTPException(503, "The free demo is busy. Please try again later or explore the source code.")
    workspace = DemoWorkspace(id=uuid4().hex, expires_at=utcnow() + timedelta(minutes=settings().demo_minutes))
    db.add(workspace)
    db.flush()
    accounts = {}
    for persona, name, role, team in ACCOUNTS:
        if role == "administrator":
            continue
        person = User(
            email=f"{persona}.{workspace.id}@example.com",
            name=name,
            role=role,
            team=team,
            password_hash=DUMMY_HASH,
            demo_workspace_id=workspace.id,
        )
        db.add(person)
        db.flush()
        accounts[persona] = person
    seed_scenarios(db, accounts, workspace.id)
    result = response_for(db, workspace, data.persona)
    db.commit()
    return result


@router.post("/switch", dependencies=[Depends(require_demo)])
def switch_demo(data: DemoSwitch, db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(
            data.session_token,
            settings().jwt_secret,
            algorithms=["HS256"],
            options={"require": ["workspace", "purpose", "exp"]},
        )
        if payload["purpose"] != "demo-switch":
            raise ValueError("Wrong token purpose")
        workspace = db.get(DemoWorkspace, payload["workspace"])
        if workspace is None:
            raise ValueError("Missing workspace")
        expires = workspace.expires_at
        if (expires if expires.tzinfo else expires.replace(tzinfo=timezone.utc)) <= utcnow():
            raise ValueError("Expired workspace")
    except (jwt.InvalidTokenError, ValueError, TypeError):
        raise HTTPException(401, "This demo has expired. Start a fresh workspace.") from None
    return response_for(db, workspace, data.persona)
