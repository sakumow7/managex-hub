from datetime import timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import DemoWorkspace, User, utcnow

passwords = PasswordHash.recommended()
bearer = HTTPBearer()
DUMMY_HASH = passwords.hash("unused-timing-equalizer-password")


def create_token(user_id: int, workspace_id: str | None = None):
    return jwt.encode(
        {"sub": str(user_id), "workspace": workspace_id, "exp": utcnow() + timedelta(minutes=settings().token_minutes)},
        settings().jwt_secret,
        algorithm="HS256",
    )


def current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
):
    try:
        payload = jwt.decode(
            credentials.credentials, settings().jwt_secret, algorithms=["HS256"], options={"require": ["exp", "sub"]}
        )
        user = db.get(User, int(payload["sub"]))
        if user is None:
            raise ValueError("Unknown user")
        if user.demo_workspace_id != payload.get("workspace"):
            raise ValueError("Workspace identity changed")
        if bool(user.demo_workspace_id) != settings().demo_enabled:
            raise ValueError("Wrong authentication mode")
        if user.demo_workspace_id:
            # Serialize mutations against the workspace budget in PostgreSQL.
            query = select(DemoWorkspace).where(DemoWorkspace.id == user.demo_workspace_id)
            if request.method not in {"GET", "HEAD", "OPTIONS"}:
                query = query.with_for_update()
            workspace = db.scalar(query)
            expires = workspace.expires_at if workspace else None
            if expires and expires.tzinfo is None:
                expires = expires.replace(tzinfo=timezone.utc)
            if expires is None or expires <= utcnow():
                raise HTTPException(401, "This demo has expired. Start a fresh workspace from the welcome page.")
            if request.method not in {"GET", "HEAD", "OPTIONS"}:
                if workspace.mutations >= settings().demo_max_mutations:
                    raise HTTPException(
                        429, "This demo's change limit is reached. You can keep exploring until it expires."
                    )
                workspace.mutations += 1
        return user
    except (jwt.InvalidTokenError, ValueError, KeyError):
        raise HTTPException(401, "Session expired or invalid") from None


def is_manager(user: User):
    return user.role in {"supervisor", "administrator"}
