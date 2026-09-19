from datetime import timedelta

import pytest
from sqlalchemy import func, select

from app.config import Settings, settings
from app.db import get_db
from app.main import app
from app.models import DemoWorkspace, User, WorkOrder, utcnow


@pytest.fixture
def demo_client(client, monkeypatch):
    monkeypatch.setattr(settings(), "demo_enabled", True)
    return client


@pytest.fixture
def db_session(client):
    generator = app.dependency_overrides[get_db]()
    session = next(generator)
    yield session
    generator.close()


def start(client, persona="supervisor"):
    result = client.post("/api/demo/sessions", json={"persona": persona})
    assert result.status_code == 201, result.text
    return result.json()


def headers(session):
    return {"Authorization": f"Bearer {session['access_token']}"}


def switch(client, session, persona):
    result = client.post("/api/demo/switch", json={"session_token": session["session_token"], "persona": persona})
    assert result.status_code == 200, result.text
    return result.json()


def test_demo_is_opt_in_and_neon_url_normalization(client):
    assert client.post("/api/demo/sessions", json={}).status_code == 404
    config = Settings(database_url="postgresql://user:pass@db.example/db?sslmode=require", jwt_secret="x" * 32)
    assert config.database_url == "postgresql+psycopg://user:pass@db.example/db?sslmode=require"
    assert client.get("/api/live").json() == {"status": "ok"}


def test_isolated_queues_directory_assignments_and_secondary_surfaces(demo_client):
    a, b = start(demo_client), start(demo_client)
    ha, hb = headers(a), headers(b)
    tickets_a = demo_client.get("/api/tickets", headers=ha).json()
    tickets_b = demo_client.get("/api/tickets", headers=hb).json()
    assert len(tickets_a) == len(tickets_b) == 7
    assert not ({t["id"] for t in tickets_a} & {t["id"] for t in tickets_b})
    people_a = demo_client.get("/api/users", headers=ha).json()
    people_b = demo_client.get("/api/users", headers=hb).json()
    assert len(people_a) == len(people_b) == 6
    assert all(p["role"] != "administrator" for p in people_a)
    ticket = demo_client.post(
        "/api/tickets",
        headers=ha,
        json={
            "title": "Visitor A private sample",
            "description": "Fictional isolated workspace ticket",
        },
    ).json()
    path = f"/api/tickets/{ticket['id']}"
    for suffix in ("", "/comments", "/history", "/related", "/attachments"):
        assert demo_client.get(path + suffix, headers=hb).status_code == 404
    assert demo_client.patch(path, headers=hb, json={"priority": "urgent"}).status_code == 404
    assert "Visitor A" not in demo_client.get("/api/reports/tickets.csv", headers=hb).text
    assert demo_client.get("/api/dashboard", headers=ha).json()["open"] == 8
    assert demo_client.get("/api/dashboard", headers=hb).json()["open"] == 7
    foreign_agent = next(p for p in people_b if p["role"] == "technician" and p["team"] == "cst")
    assert demo_client.patch(path, headers=ha, json={"assignee_id": foreign_agent["id"]}).status_code == 422
    b_agent = switch(demo_client, b, "technician")
    assert demo_client.get("/api/notifications", headers=headers(b_agent)).json() == []
    attached = demo_client.post(path + "/attachments", headers=ha, json={"sample_key": "troubleshooting-note"}).json()
    assert demo_client.get(path + f"/attachments/{attached['id']}", headers=hb).status_code == 404


def test_role_switch_keeps_workspace_and_restricted_policy(demo_client):
    session = start(demo_client, "requester")
    requester_headers = headers(session)
    ticket = demo_client.post(
        "/api/tickets",
        headers=requester_headers,
        json={
            "title": "Portfolio intake",
            "description": "Fictional end to end test",
        },
    ).json()
    manager = switch(demo_client, session, "supervisor")
    hm = headers(manager)
    people = demo_client.get("/api/users", headers=hm).json()
    agent = next(p for p in people if p["role"] == "technician" and p["team"] == "cst")
    path = f"/api/tickets/{ticket['id']}"
    assert demo_client.patch(path, headers=hm, json={"assignee_id": agent["id"]}).json()["status"] == "assigned"
    worker = switch(demo_client, session, "technician")
    hw = headers(worker)
    demo_client.post(path + "/comments", headers=hw, json={"body": "Fictional internal note", "internal": True})
    assert demo_client.get(path + "/comments", headers=requester_headers).json() == []
    child = demo_client.post(
        path + "/tasks",
        headers=hw,
        json={
            "title": "Fictional security check",
            "description": "Restricted sample",
            "kind": "security",
        },
    ).json()
    assert child["visible"] is False
    assert demo_client.get(f"/api/tickets/{child['id']}", headers=hm).status_code == 404
    cyber = switch(demo_client, session, "cyber")
    assert demo_client.get(f"/api/tickets/{child['id']}", headers=headers(cyber)).status_code == 200
    assert demo_client.get(path + "/related", headers=hw).json() == []


def test_demo_auth_cannot_be_used_as_admin_or_password_login(demo_client, auth):
    session = start(demo_client)
    assert (
        demo_client.post(
            "/api/auth/login", json={"email": "user4@example.com", "password": "TestPassword123!"}
        ).status_code
        == 403
    )
    assert demo_client.get("/api/auth/me", headers=auth(4)).status_code == 401
    assert (
        demo_client.get("/api/auth/me", headers={"Authorization": f"Bearer {session['session_token']}"}).status_code
        == 401
    )
    assert demo_client.post("/api/demo/sessions", json={"persona": "administrator"}).status_code == 422
    assert (
        demo_client.post(
            "/api/demo/switch", json={"session_token": session["access_token"], "persona": "cyber"}
        ).status_code
        == 401
    )
    assert (
        demo_client.post(
            "/api/users",
            headers=headers(session),
            json={
                "email": "new@example.com",
                "name": "New",
                "role": "administrator",
                "password": "NeverPublic123!",
            },
        ).status_code
        == 403
    )
    assert demo_client.get("/api/auth/me", headers=headers(session)).headers["cache-control"] == "no-store"


def test_expiry_rejects_reads_switches_and_cleans_only_demo_data(demo_client, db_session):
    session = start(demo_client)
    workspace = db_session.scalar(select(DemoWorkspace))
    workspace.expires_at = utcnow() - timedelta(minutes=1)
    old_id = workspace.id
    db_session.commit()
    assert demo_client.get("/api/tickets", headers=headers(session)).status_code == 401
    assert (
        demo_client.post(
            "/api/demo/switch", json={"session_token": session["session_token"], "persona": "requester"}
        ).status_code
        == 401
    )
    fresh = start(demo_client)
    db_session.expire_all()
    assert db_session.get(DemoWorkspace, old_id) is None
    assert db_session.scalar(select(func.count()).select_from(User).where(User.demo_workspace_id.is_(None))) == 8
    assert db_session.scalar(select(func.count()).select_from(WorkOrder)) == 8
    assert demo_client.get("/api/tickets", headers=headers(fresh)).status_code == 200
    # SQLite may reuse deleted integer IDs: an old bearer must not gain a new workspace.
    assert demo_client.get("/api/tickets", headers=headers(session)).status_code == 401


def test_capacity_and_write_budget_are_bounded(demo_client, monkeypatch):
    monkeypatch.setattr(settings(), "demo_max_workspaces", 1)
    session = start(demo_client)
    assert demo_client.post("/api/demo/sessions", json={}).status_code == 503
    monkeypatch.setattr(settings(), "demo_max_mutations", 1)
    h = headers(session)
    ticket = demo_client.get("/api/tickets", headers=h).json()[0]
    path = f"/api/tickets/{ticket['id']}/comments"
    assert demo_client.post(path, headers=h, json={"body": "One allowed change"}).status_code == 201
    assert demo_client.post(path, headers=h, json={"body": "Over budget"}).status_code == 429
    assert demo_client.get("/api/tickets", headers=h).status_code == 200
    assert switch(demo_client, session, "requester")["persona"] == "requester"
