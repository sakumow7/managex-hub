import csv
import io

import pytest

from app.main import csv_safe


def create(client, auth, **overrides):
    result = client.post(
        "/api/work-orders",
        headers=auth(1),
        json={
            "title": "Sample inspection",
            "description": "Inspect a fictional facility",
            "location": "Example center",
            "kind": "inspection",
            **overrides,
        },
    )
    assert result.status_code == 201
    return result.json()["id"]


def test_full_workflow_and_history(client, auth):
    order = create(client, auth)
    path = f"/api/work-orders/{order}"
    assert (
        client.patch(path, headers=auth(3), json={"assignee_id": 2, "priority": "high"}).json()["status"] == "assigned"
    )
    for status in ["in_progress", "completed"]:
        assert client.patch(path, headers=auth(2), json={"status": status}).status_code == 200
    assert client.patch(path, headers=auth(2), json={"status": "closed"}).status_code == 403
    assert client.patch(path, headers=auth(3), json={"status": "closed"}).json()["closed_at"]
    assert len(client.get(path + "/history", headers=auth(1)).json()) == 5
    assert client.patch(path, headers=auth(3), json={"priority": "low"}).status_code == 409
    assert client.get("/api/dashboard", headers=auth(3)).json()["average_completion_days"] is not None
    assert client.get("/api/notifications", headers=auth(1)).json()


@pytest.mark.parametrize("user_id", [2, 5, 6])
def test_unrelated_users_cannot_read_order_history_attachments_or_export(client, auth, user_id):
    order = create(client, auth)
    for suffix in ["", "/history", "/attachments"]:
        assert client.get(f"/api/work-orders/{order}{suffix}", headers=auth(user_id)).status_code == 404
    assert client.get("/api/work-orders", headers=auth(user_id)).json() == []
    assert client.get("/api/dashboard", headers=auth(user_id)).json()["open"] == 0
    assert (
        len(list(csv.reader(io.StringIO(client.get("/api/reports/work-orders.csv", headers=auth(user_id)).text)))) == 1
    )


def test_permissions_and_rollback(client, auth):
    order = create(client, auth)
    path = f"/api/work-orders/{order}"
    assert client.patch(path, headers=auth(1), json={"priority": "urgent"}).status_code == 403
    assert client.patch(path, headers=auth(3), json={"assignee_id": 1}).status_code == 422
    assert client.patch(path, headers=auth(3), json={"priority": "urgent", "status": "closed"}).status_code == 409
    assert client.get(path, headers=auth(3)).json()["priority"] == "medium"
    assert client.patch(path, headers=auth(3), json={"assignee_id": 2}).status_code == 200
    assert client.patch(path, headers=auth(2), json={"assignee_id": 6}).status_code == 403
    assert client.patch(path, headers=auth(2), json={"priority": "urgent"}).status_code == 403
    assert client.patch(path, headers=auth(2), json={"status": "completed"}).status_code == 409
    assert client.patch(path, headers=auth(3), json={"assignee_id": None}).status_code == 422
    assert client.patch(path, headers=auth(3), json={"requester_id": 5}).status_code == 422


def test_only_sample_files_and_authorized_download(client, auth):
    order = create(client, auth)
    path = f"/api/work-orders/{order}/attachments"
    assert client.post(path, headers=auth(1), json={"sample_key": "../../secret"}).status_code == 422
    attachment = client.post(path, headers=auth(1), json={"sample_key": "inspection-checklist"}).json()
    assert client.post(path, headers=auth(1), json={"sample_key": "inspection-checklist"}).status_code == 409
    download = client.get(f"{path}/{attachment['id']}", headers=auth(1))
    assert download.status_code == 200 and "SAMPLE ONLY" in download.text
    assert client.get(f"{path}/{attachment['id']}", headers=auth(5)).status_code == 404


def test_authentication_and_user_administration(client, auth):
    assert client.get("/api/work-orders").status_code in [401, 403]
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer invalid"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "user1@example.com", "password": "wrong"}).status_code == 401
    login = client.post("/api/auth/login", json={"email": "user1@example.com", "password": "TestPassword123!"})
    assert login.status_code == 200 and login.json()["access_token"]
    assert client.get("/api/users", headers=auth(1)).status_code == 403
    data = {"email": "new@example.com", "name": "New user", "role": "technician", "password": "TestPassword123!"}
    assert client.post("/api/users", headers=auth(3), json=data).status_code == 403
    result = client.post("/api/users", headers=auth(4), json=data)
    assert result.status_code == 201 and "password_hash" not in result.json()
    assert client.post("/api/users", headers=auth(4), json=data).status_code == 409


def test_filters_report_and_notifications(client, auth):
    create(client, auth, title="=SUM(1+1)", due_at="2020-01-01T00:00:00Z", priority="urgent")
    create(client, auth, title="Plumbing check", category="Plumbing")
    assert len(client.get("/api/work-orders?q=Plumbing", headers=auth(3)).json()) == 1
    assert len(client.get("/api/work-orders?priority=urgent", headers=auth(3)).json()) == 1
    assert len(client.get("/api/work-orders?offset=1&limit=1", headers=auth(3)).json()) == 1
    dashboard = client.get("/api/dashboard", headers=auth(3)).json()
    assert dashboard["open"] == 2 and dashboard["overdue"] == 1
    assert "'=SUM" in client.get("/api/reports/work-orders.csv", headers=auth(3)).text
    notification = client.get("/api/notifications", headers=auth(3)).json()[0]
    assert client.patch(f"/api/notifications/{notification['id']}/read", headers=auth(1)).status_code == 404
    assert client.patch(f"/api/notifications/{notification['id']}/read", headers=auth(3)).status_code == 200


@pytest.mark.parametrize("value", ["=1+1", "+cmd", "-cmd", "@SUM(1)", "\tformula", "\rformula", "  =1+1"])
def test_csv_formula_injection(value):
    assert csv_safe(value).startswith("'")


def test_input_validation(client, auth):
    assert (
        client.post(
            "/api/work-orders",
            headers=auth(1),
            json={"title": "   ", "description": "Valid description", "location": "Example"},
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/work-orders",
            headers=auth(1),
            json={
                "title": "Valid title",
                "description": "Valid description",
                "location": "Example",
                "due_at": "2026-01-01T00:00:00",
            },
        ).status_code
        == 422
    )
