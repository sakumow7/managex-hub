# ManageX Hub

A portfolio starter for maintenance work orders and inspections. Requesters submit work, supervisors assign technicians, technicians record progress, and leaders see workload trends.

All seeded facilities, people, requests, and attachments are fictional. This project contains no government processes or operational data.

![ManageX Hub dashboard with fictional requests](docs/dashboard.png)

## Stack

- React + TypeScript + Vite
- Python + FastAPI + SQLAlchemy + Alembic
- PostgreSQL 17
- Docker Compose + Nginx
- pytest for API/unit tests; Playwright for browser workflows

## Quick start with Docker

Install Docker Desktop with Compose, then run these commands from the repository root:

```sh
cp .env.example .env
# PowerShell: Copy-Item .env.example .env
```

Edit `.env`: replace `JWT_SECRET` with a random value of at least 32 characters. For example, generate one with `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Keep the database password URL-safe because Compose places it in a connection URL. Set `DEMO_PASSWORD` to a password of at least 12 characters.

```sh
docker compose up --build -d
docker compose exec api python -m app.seed
```

Open **http://localhost:8080**. API documentation is at **http://localhost:8000/docs**. The initial migration runs before the API starts. The seed command is explicit and skips databases that already contain users.

| Demo email | Role |
| --- | --- |
| requester@example.com | Submit and track own requests |
| technician@example.com | Update assigned work |
| supervisor@example.com | Prioritize, assign, reopen completed work, close |
| administrator@example.com | Supervisor access plus API user creation |

All four accounts use the `DEMO_PASSWORD` you set. The example value is `SamplePass123!`; it is only a local demonstration password. Changing the environment variable after seeding does not change existing passwords.

Stop with `docker compose down`; the named database volume persists. Do not remove the volume unless you intend to erase its data.

## What works in this starter

- Password sign-in with Argon2 hashes and expiring JWTs; role and record access enforced in the API.
- Maintenance and inspection requests with categories, priorities, due dates, assignment, and progress notes.
- Workflow: `submitted → assigned → in_progress → completed → closed`. Assignment automatically moves submitted work to assigned. Completed work can return to in progress; closed work is read-only.
- Per-order status history and audit events written in the same transaction as updates.
- A sample attachment catalog and authenticated downloads. Arbitrary uploads are deliberately unsupported.
- Dashboard with open/overdue work, submission-to-close average, completed count, and recurring categories.
- Search, type/status/priority filtering, pagination, and CSV export with spreadsheet formula escaping.
- Simulated in-app notifications with read tracking. No email is sent.
- Administrator-only user creation through `POST /api/users`; user administration UI is a roadmap item.

“Recurring issues” currently means repeated categories across visible requests; it is not equipment-level root-cause analysis. Dashboard metrics cover all visible records, while queue/export filters apply to their own results. Completed work remains open until supervisor closeout.

## Local development

Prerequisites: Python 3.12+, Node.js 22.12+, and PostgreSQL (or Docker for the database).

```sh
docker compose up db -d
cd backend
python -m venv .venv
# macOS/Linux:
source .venv/bin/activate
# PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements-lock.txt
```

Set `DATABASE_URL` and `JWT_SECRET` in `backend/.env`. Also set `DEMO_PASSWORD` in your shell for the seed command:

```dotenv
DATABASE_URL=postgresql+psycopg://workorders:local-development-only@localhost:5432/workorders
JWT_SECRET=your-random-secret-at-least-32-characters
```

```sh
alembic upgrade head
DEMO_PASSWORD='SamplePass123!' python -m app.seed
# PowerShell: $env:DEMO_PASSWORD='SamplePass123!'; python -m app.seed
uvicorn app.main:app --reload
```

In another terminal:

```sh
cd frontend
npm ci
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to FastAPI. Tokens stay in browser memory, so reloading requires sign-in. For a quick local smoke test without PostgreSQL, `DATABASE_URL=sqlite:///./demo.db` is supported; PostgreSQL is the intended deployment database.

## Validation

```sh
cd backend
pytest -q
ruff check .
cd ../frontend
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser tests require a running, migrated, seeded API on port 8000. They start Vite automatically. To test the Docker frontend instead, set `BASE_URL=http://127.0.0.1:8080`. Set `DEMO_PASSWORD` if you changed it. Tests add fictional requests to the selected demo database.

API tests use isolated SQLite by default. To verify against PostgreSQL, set `TEST_DATABASE_URL` to a **dedicated disposable database**: the test fixture creates and drops application tables. Never use a development or production database for that variable.

### Enable GitHub Actions

A ready-to-enable workflow is in [docs/github-actions-ci.yml](docs/github-actions-ci.yml). Move it to `.github/workflows/ci.yml` and commit through a GitHub login with workflow permission to activate PostgreSQL, container, and browser checks. It is stored as a template because the GitHub CLI login used to create this repository did not have the `workflow` scope.

Initial local verification: 16 API/unit tests passed, 3 browser tests passed, lint passed, and the production frontend built successfully. Desktop and mobile views were inspected. Docker and PostgreSQL checks have not yet run; local verification used SQLite.

## Repository layout

```text
backend/
  app/           configuration, models, schemas, auth, workflow, routes, seed
  migrations/    versioned database schema
  tests/         permissions, workflow, validation, reports
frontend/
  src/           React screens, typed API client, styles
  tests/         Playwright browser workflows
docs/            architecture, permissions, roadmap
compose.yaml     database → migrations → API → frontend
```

See [architecture and permissions](docs/architecture.md), [roadmap](docs/roadmap.md), and [contributing](CONTRIBUTING.md).

## Starter boundaries

This is a local development and portfolio foundation. Before a public deployment, add HTTPS, login throttling, account recovery/revocation, operational monitoring, backups, and a proper secret store. Demo credentials and the default database password must be replaced. Audit events are application-managed and are not a tamper-proof compliance ledger. There is no tenant separation or organizational data model yet.

Dependency versions used for verification are recorded in `backend/requirements-lock.txt` and `frontend/package-lock.json`. `backend/requirements.txt` records the allowed direct dependency ranges. Update and re-lock intentionally.

Reference documentation: [FastAPI password hashing and JWT](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/) and [Vite setup](https://vite.dev/guide/).
