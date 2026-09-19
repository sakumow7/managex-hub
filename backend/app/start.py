"""Free-host startup: migrate before serving; no paid pre-deploy job needed."""

import os

import uvicorn
from alembic import command
from alembic.config import Config

from .config import settings


def main():
    command.upgrade(Config("alembic.ini"), "head")
    if settings().demo_enabled:
        from .db import SessionLocal
        from .demo import cleanup_expired

        with SessionLocal() as db:
            cleanup_expired(db)
            db.commit()
    uvicorn.run("app.main:app", host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))


if __name__ == "__main__":
    main()
