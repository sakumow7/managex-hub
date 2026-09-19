# ManageX Hub — Portfolio Edition

A full-stack IT service desk portfolio built with **React, TypeScript, FastAPI and PostgreSQL**. Visitors can launch a temporary workspace, switch between six perspectives, and try ticket intake, assignment, troubleshooting and cross-team handoffs. No signup or shared public password is required.

**Start here:** [Project walkthrough](docs/portfolio.md) · [Host for free on Render + Neon](docs/deploy-free.md) · [Architecture and permissions](docs/architecture.md)

![ManageX Hub portfolio landing page with six demo perspectives](docs/portfolio-preview.png)

## Run the portfolio locally

Requires Python 3.12 and Node.js 22.12+. SQLite works for local exploration; PostgreSQL is the hosting target.

From `backend`:

```sh
python -m venv .venv
# PowerShell: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
pip install -r requirements-lock.txt
cp .env.example .env
# PowerShell: Copy-Item .env.example .env
```

Replace JWT_SECRET in backend/.env with a random value of at least 32 characters (`python -c "import secrets; print(secrets.token_urlsafe(48))"`), then run `python -m app.start`. This migrates the database and starts the API. Do not run the legacy seed for portfolio mode.

In a second terminal, from `frontend`:

```sh
cp .env.example .env
# PowerShell: Copy-Item .env.example .env
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Choose a perspective and launch. Each visitor gets six fictional identities and eight scenarios in a separate workspace, with a default one-hour expiry. Reloading keeps a signed workspace-resume token in sessionStorage for that browser tab; access tokens remain in memory. Switching roles preserves that workspace's changes. Normal password login is disabled in public demo mode, and there is no public administrator persona.

The existing authenticated local mode remains available below. Set DEMO_ENABLED=false in the backend and VITE_DEMO_MODE=false in the frontend to use it; rebuild frontend assets when changing build-time settings. The root Compose .env has both flags, defaulting to false for compatibility. Set both true for the portfolio UI in Docker.

## Verify the portfolio

From backend: `pytest -q` and `ruff check .`. From frontend: `npm run build`.

With the API running in demo mode and frontend configured for demo mode:

```powershell
Set-Location frontend
npx.cmd playwright install chromium
$env:DEMO_E2E='true'
npm.cmd run test:e2e
```

The portfolio browser suite checks role switching, requester/staff visibility, visitor isolation, mobile entry and server-wake feedback. To run the original four password-login workflows, use normal mode and seeded accounts, then unset DEMO_E2E. Optional E2E_PORT, API_PROXY_TARGET and PLAYWRIGHT_CHANNEL support alternate local ports and an installed browser. See [verification](docs/verification.md) for the results and limits of checks performed for this refactor.

## Original local evaluation mode

An internal IT workflow prototype focused on **CST trouble-ticket tracking**. Requesters report issues, supervisors triage and assign, agents troubleshoot and reply, and other departments receive linked tasks. There is no billing or SaaS onboarding.

All seeded people, devices, requests, and attachments are fictional. Start with the [15-minute CST evaluation](docs/cst-evaluation.md) to see whether this workflow fits your work.

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

Open **http://localhost:8080**. API documentation is at **http://localhost:8000/docs**. Migrations run before the API starts. IT seeding is explicit and idempotent: it preserves existing accounts and records, adds missing demo users, and inserts IT sample scenarios once. Existing maintenance records are available with the Legacy maintenance records filter.

| Demo email | Role |
| --- | --- |
| requester@example.com | Submit and track own requests |
| technician@example.com | CST agent: team queue, progress, internal notes and replies |
| supervisor@example.com | Prioritize, assign, reopen completed work, close |
| administrator@example.com | All queues, including restricted tasks, plus API user creation |
| cyber@example.com | Cybersecurity agent |
| developer@example.com | Development agent |
| operations@example.com | IT Operations agent |

Newly seeded accounts use the `DEMO_PASSWORD` you set. The example value is `SamplePass123!`; it is only a local demonstration password. Changing the environment variable after seeding does not change existing passwords.

Stop with `docker compose down`; the named database volume persists. Do not remove the volume unless you intend to erase its data.

## What works in this prototype

- CST trouble tickets, service requests, access requests, security tasks, bugs, department tasks, and change requests.
- CST, Cybersecurity, Development, and IT Operations queues; a personal assigned-work view.
- Supervisor assignment to agents in the owning team, prioritization, and ordinary-ticket transfers.
- Workflow: submitted → assigned → in progress → completed → closed, with blocked work and reopening before closeout.
- Requester-visible replies, staff-only internal notes, and staff audit history.
- Linked cross-team tasks with independent status and visibility-aware links.
- Restricted cybersecurity work enforced across API reads, links, metrics, notifications, and exports.
- Open, unassigned, overdue, and blocked counts; search and status/priority/type filters; CSV exports.
- Sample-only attachments, in-app notifications, and administrator user creation through the API.

Targets are due dates, not SLA timers. Access and change requests use the same prototype workflow and do not yet enforce approvals. Linked tasks do not automatically block parent closeout. See [architecture and permissions](docs/architecture.md) for exact access rules.

## Upgrade an existing local installation

Keep your existing `.env` and database volume, then run:

```sh
docker compose up --build -d --wait
docker compose exec api python -m app.seed
```

Refresh the browser at http://localhost:8080. The IT migration adds fields and tables without deleting prior records. Stop any separate local Uvicorn instance before starting Docker, because both use port 8000.

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

IT prototype verification: 20 API/unit tests passed on both SQLite and a dedicated PostgreSQL database; 4 browser tests passed against Docker. The frontend production build, Docker startup, and Alembic schema check passed.

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

This is a local, single-organization evaluation prototype. Use fictional scenarios initially. Operational use requires your organization’s approval of the hosting environment and data scope, appropriate identity/account lifecycle, HTTPS, backups, and monitoring. Audit events are application-managed, not a tamper-proof compliance ledger. Subscription billing and multi-customer tenancy are outside the current scope.

Dependency versions used for verification are recorded in `backend/requirements-lock.txt` and `frontend/package-lock.json`. `backend/requirements.txt` records the allowed direct dependency ranges. Update and re-lock intentionally.

Reference documentation: [FastAPI password hashing and JWT](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/) and [Vite setup](https://vite.dev/guide/).
