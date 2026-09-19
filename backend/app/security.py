from datetime import timedelta

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import User, utcnow

passwords = PasswordHash.recommended()
bearer = HTTPBearer()
DUMMY_HASH = passwords.hash("unused-timing-equalizer-password")


def create_token(user_id: int):
    return jwt.encode(
        {"sub": str(user_id), "exp": utcnow() + timedelta(minutes=settings().token_minutes)},
        settings().jwt_secret,
        algorithm="HS256",
    )


def current_user(
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
        return user
    except (jwt.InvalidTokenError, ValueError, KeyError):
        raise HTTPException(401, "Session expired or invalid") from None


def is_manager(user: User):
    return user.role in {"supervisor", "administrator"}
