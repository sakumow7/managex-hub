import os

os.environ.setdefault("JWT_SECRET", "test-only-secret-with-at-least-thirty-two-characters")
os.environ.setdefault("DATABASE_URL", "sqlite://")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.db import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402
from app.security import create_token, passwords  # noqa: E402


@pytest.fixture
def client():
    url = os.environ.get("TEST_DATABASE_URL", "sqlite://")
    kwargs = {"connect_args": {"check_same_thread": False}, "poolclass": StaticPool} if url == "sqlite://" else {}
    engine = create_engine(url, **kwargs)
    # TEST_DATABASE_URL must point to a disposable, dedicated test database.
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)
    with session() as db:
        for index, role in enumerate(
            ["requester", "technician", "supervisor", "administrator", "requester", "technician"], 1
        ):
            db.add(
                User(
                    email=f"user{index}@example.com",
                    name=f"User {index}",
                    role=role,
                    password_hash=passwords.hash("TestPassword123!"),
                )
            )
        db.commit()

    def override():
        with session() as db:
            yield db

    app.dependency_overrides[get_db] = override
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def auth():
    return lambda user_id: {"Authorization": f"Bearer {create_token(user_id)}"}
