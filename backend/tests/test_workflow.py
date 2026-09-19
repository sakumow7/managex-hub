import csv
import io
import pytest
from app.main import csv_safe


def create(client, auth, user_id=1, **overrides):
    result = client.post(
        "/api/tickets",
        headers=auth(user_id),
        json={
            "title": "Sample VPN issue",
            "description": "Fictional VPN client cannot connect",
            "location": "DEMO-LAPTOP",
            **overrides,
        },
    )
    assert result.status_code == 201, result.text
    return result.json()["id"]


def test_cst_lifecycle_and_blocked_work(client, auth):
    ticket = create(client, auth)
    path = f"/api/tickets/{ticket}"
    assert (
        client.patch(path, headers=auth(3), json={"assignee_id": 2, "priority": "high"}).json()["status"] == "assigned"
    )
    for status in ["in_progress", "blocked", "in_progress", "completed"]:
        assert client.patch(path, headers=auth(2), json={"status": status}).status_code == 200
    assert client.patch(path, headers=auth(2), json={"status": "closed"}).status_code == 403
    assert client.patch(path, headers=auth(3), json={"status": "closed"}).json()["closed_at"]
    assert len(client.get(path + "/history", headers=auth(2)).json()) == 7
    assert client.patch(path, headers=auth(3), json={"priority": "low"}).status_code == 409
    assert client.get("/api/dashboard", headers=auth(3)).json()["average_completion_days"] is not None


@pytest.mark.parametrize("user_id", [5, 6, 8])
def test_unrelated_users_cannot_read_export_or_find_ticket(client, auth, user_id):
    ticket = create(client, auth)
    for suffix in ["", "/history", "/attachments", "/comments", "/related"]:
        assert client.get(f"/api/tickets/{ticket}{suffix}", headers=auth(user_id)).status_code == 404
    assert client.get("/api/tickets", headers=auth(user_id)).json() == []
    assert client.get("/api/dashboard", headers=auth(user_id)).json()["open"] == 0
    assert len(list(csv.reader(io.StringIO(client.get("/api/reports/tickets.csv", headers=auth(user_id)).text)))) == 1


def test_owning_team_sees_unassigned_queue(client, auth):
    ticket = create(client, auth)
    assert client.get(f"/api/tickets/{ticket}", headers=auth(2)).status_code == 200
    assert len(client.get("/api/tickets?team=cst", headers=auth(2)).json()) == 1
    assert client.get("/api/tickets?mine=true", headers=auth(2)).json() == []


def test_permissions_assignment_and_atomic_rollback(client, auth):
    path = f"/api/tickets/{create(client, auth)}"
    assert client.patch(path, headers=auth(1), json={"priority": "urgent"}).status_code == 403
    assert client.patch(path, headers=auth(3), json={"assignee_id": 6}).status_code == 422
    assert client.patch(path, headers=auth(3), json={"priority": "urgent", "status": "closed"}).status_code == 409
    assert client.get(path, headers=auth(3)).json()["priority"] == "medium"
    assert client.patch(path, headers=auth(3), json={"assignee_id": 2}).status_code == 200
    assert client.patch(path, headers=auth(2), json={"priority": "urgent"}).status_code == 403
    assert client.patch(path, headers=auth(2), json={"status": "completed"}).status_code == 409
    assert client.patch(path, headers=auth(3), json={"assignee_id": None}).status_code == 422
    assert client.patch(path, headers=auth(3), json={"restricted": False}).status_code == 422


def test_public_replies_and_internal_notes_do_not_leak(client, auth):
    path = f"/api/tickets/{create(client, auth)}"
    assert (
        client.post(
            path + "/comments", headers=auth(2), json={"body": "Internal diagnostic secret", "internal": True}
        ).status_code
        == 201
    )
    assert client.patch(path, headers=auth(3), json={"note": "Private progress detail"}).status_code == 200
    assert (
        client.post(
            path + "/comments", headers=auth(2), json={"body": "We are investigating.", "internal": False}
        ).status_code
        == 201
    )
    assert (
        client.post(path + "/comments", headers=auth(1), json={"body": "Secret", "internal": True}).status_code == 403
    )
    assert client.post(path + "/comments", headers=auth(1), json={"body": "Thank you."}).status_code == 201
    requester_comments = client.get(path + "/comments", headers=auth(1)).json()
    assert len(requester_comments) == 2
    assert all(not c["internal"] for c in requester_comments)
    assert len(client.get(path + "/comments", headers=auth(2)).json()) == 4
    assert client.get(path + "/history", headers=auth(1)).json() == []
    inbox = client.get("/api/notifications", headers=auth(1)).text
    report = client.get("/api/reports/tickets.csv", headers=auth(1)).text
    assert "diagnostic secret" not in inbox + report
    assert "Private progress" not in inbox + report


def test_restricted_cyber_task_is_hidden_across_all_surfaces(client, auth):
    parent = create(client, auth)
    result = client.post(
        f"/api/tickets/{parent}/tasks",
        headers=auth(2),
        json={
            "title": "Secret cyber investigation",
            "description": "Restricted fictional details",
            "kind": "security",
            "team": "cst",
        },
    )
    assert result.status_code == 201 and result.json()["visible"] is False
    child = result.json()["id"]
    assert client.get(f"/api/tickets/{child}", headers=auth(7)).json()["restricted"] is True
    assert client.get(f"/api/tickets/{child}", headers=auth(4)).status_code == 200
    for user_id in [1, 2, 3, 5, 6, 8]:
        for suffix in ["", "/history", "/comments", "/attachments", "/related"]:
            assert client.get(f"/api/tickets/{child}{suffix}", headers=auth(user_id)).status_code == 404
        assert "Secret cyber" not in client.get("/api/tickets?q=Secret", headers=auth(user_id)).text
        assert "Secret cyber" not in client.get("/api/reports/tickets.csv", headers=auth(user_id)).text
        assert client.get("/api/dashboard", headers=auth(user_id)).json()["teams"]["cybersecurity"] == 0
        assert "Secret cyber" not in client.get("/api/notifications", headers=auth(user_id)).text
    assert client.get(f"/api/tickets/{parent}/related", headers=auth(2)).json() == []
    assert len(client.get(f"/api/tickets/{parent}/related", headers=auth(4)).json()) == 1
    assert client.patch(f"/api/tickets/{child}", headers=auth(4), json={"team": "cst"}).status_code == 422
    assert client.patch(f"/api/tickets/{parent}", headers=auth(3), json={"team": "cybersecurity"}).status_code == 422
    assert (
        client.post(
            "/api/tickets",
            headers=auth(1),
            json={"title": "Security", "description": "Fictional details", "kind": "security"},
        ).status_code
        == 403
    )


def test_development_handoff_and_transfer(client, auth):
    parent = create(client, auth)
    child = client.post(
        f"/api/tickets/{parent}/tasks",
        headers=auth(2),
        json={"title": "Fix sample bug", "description": "Fictional app failure", "kind": "bug", "team": "development"},
    ).json()["id"]
    assert client.get(f"/api/tickets/{child}", headers=auth(6)).status_code == 200
    assert client.get(f"/api/tickets/{child}", headers=auth(2)).status_code == 200
    assert client.patch(f"/api/tickets/{child}", headers=auth(2), json={"note": "change"}).status_code == 403
    assert len(client.get(f"/api/tickets/{parent}/related", headers=auth(2)).json()) == 1
    assert client.get(f"/api/tickets/{parent}/related", headers=auth(1)).json() == []
    assert (
        client.post(
            f"/api/tickets/{parent}/tasks", headers=auth(1), json={"title": "Bad task", "description": "Not allowed"}
        ).status_code
        == 403
    )
    client.patch(f"/api/tickets/{parent}", headers=auth(3), json={"assignee_id": 2})
    transferred = client.patch(f"/api/tickets/{parent}", headers=auth(3), json={"team": "it_operations"}).json()
    assert transferred["assignee_id"] is None and transferred["status"] == "submitted"
    assert client.get(f"/api/tickets/{parent}", headers=auth(2)).status_code == 404
    assert client.get("/api/notifications", headers=auth(2)).json() == []
    assert client.get(f"/api/tickets/{parent}", headers=auth(8)).status_code == 200


def test_sample_attachments_require_ticket_access(client, auth):
    ticket = create(client, auth)
    path = f"/api/tickets/{ticket}/attachments"
    assert client.post(path, headers=auth(1), json={"sample_key": "../../secret"}).status_code == 422
    attachment = client.post(path, headers=auth(1), json={"sample_key": "troubleshooting-note"}).json()
    assert client.post(path, headers=auth(1), json={"sample_key": "troubleshooting-note"}).status_code == 409
    result = client.get(f"{path}/{attachment['id']}", headers=auth(1))
    assert result.status_code == 200 and "SAMPLE ONLY" in result.text
    assert client.get(f"{path}/{attachment['id']}", headers=auth(5)).status_code == 404


def test_authentication_and_admin(client, auth):
    assert client.get("/api/tickets").status_code in [401, 403]
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer invalid"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "user1@example.com", "password": "wrong"}).status_code == 401
    assert (
        client.post("/api/auth/login", json={"email": "user1@example.com", "password": "TestPassword123!"}).status_code
        == 200
    )
    assert client.get("/api/users", headers=auth(1)).status_code == 403
    data = {
        "email": "new@example.com",
        "name": "New agent",
        "role": "technician",
        "team": "development",
        "password": "TestPassword123!",
    }
    assert client.post("/api/users", headers=auth(3), json=data).status_code == 403
    result = client.post("/api/users", headers=auth(4), json=data)
    assert result.status_code == 201 and result.json()["team"] == "development"
    assert "password_hash" not in result.json()
    assert client.post("/api/users", headers=auth(4), json=data).status_code == 409


def test_filters_metrics_export_and_notification_ownership(client, auth):
    create(client, auth, title="=SUM(1+1)", due_at="2020-01-01T00:00:00Z", priority="urgent")
    create(client, auth, title="Printer check", category="Hardware")
    assert len(client.get("/api/tickets?q=Printer", headers=auth(3)).json()) == 1
    assert len(client.get("/api/tickets?priority=urgent", headers=auth(3)).json()) == 1
    assert len(client.get("/api/tickets?offset=1&limit=1", headers=auth(3)).json()) == 1
    metrics = client.get("/api/dashboard", headers=auth(3)).json()
    assert metrics["open"] == metrics["unassigned"] == 2 and metrics["overdue"] == 1
    assert "'=SUM" in client.get("/api/reports/tickets.csv", headers=auth(3)).text
    notification = client.get("/api/notifications", headers=auth(3)).json()[0]
    assert client.patch(f"/api/notifications/{notification['id']}/read", headers=auth(1)).status_code == 404
    assert client.patch(f"/api/notifications/{notification['id']}/read", headers=auth(3)).status_code == 200


@pytest.mark.parametrize("value", ["=1+1", "+cmd", "-cmd", "@SUM(1)", "\tformula", "\rformula", "  =1+1"])
def test_csv_formula_injection(value):
    assert csv_safe(value).startswith("'")


def test_validation_and_legacy_preservation(client, auth):
    assert (
        client.post(
            "/api/tickets", headers=auth(1), json={"title": "   ", "description": "Valid description"}
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/tickets",
            headers=auth(1),
            json={"title": "Valid title", "description": "Valid description", "due_at": "2026-01-01T00:00:00"},
        ).status_code
        == 422
    )
    ticket = create(client, auth, user_id=3, kind="maintenance")
    assert client.get("/api/tickets", headers=auth(3)).json() == []
    assert client.get("/api/tickets?kind=legacy", headers=auth(3)).json()[0]["id"] == ticket
