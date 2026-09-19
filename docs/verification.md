# Portfolio refactor verification

Verified locally on September 19, 2026 using Python 3.12.14, the locked project dependencies, SQLite, and installed Google Chrome through Playwright.

| Check | Result |
| --- | --- |
| Backend `pytest -q` | 26 passed: 20 existing cases and 6 portfolio cases |
| Backend `ruff check .` | Passed |
| Frontend `npm run build` with VITE_DEMO_MODE=true | TypeScript and Vite production build passed |
| Portfolio Playwright suite | 3 passed |
| Original password-login Playwright suite | 4 passed |
| Upgrade from `2b_it_workflow` to `3c_portfolio_demo` | Existing user, ticket and reply retained with original IDs and relationships; existing users/tickets retain null workspace IDs |
| Alembic schema comparison after upgrade | No new upgrade operations detected |
| Desktop and mobile visual inspection | Landing page and desktop workspace reviewed; no page errors or mobile horizontal overflow |

## What the tests establish

The API suite exercises separate visitors' workspaces across ticket lists, details, comments, histories, linked records, attachments, downloads, user directories, assignment, exports, dashboards and notifications. It also checks restricted queues, requester visibility, disabled public password login/account creation, denied administrator persona selection, token-purpose checks, expiry, cleanup and capacity/change limits. Workspace-bound access tokens cannot become valid for a later visitor when SQLite reuses a deleted user's numeric ID.

The portfolio browser suite follows a supervisor assigning a ticket, a technician updating it and adding a private note, and a requester viewing the same workspace without that note. It checks reload/resume, isolated browser contexts, mobile keyboard interaction, and simulated sleeping-server/capacity feedback. Original browser workflows cover password-login errors and the existing IT ticket flows.

A separate visual smoke check opened the frontend and API on different local ports with an explicit allowed origin, launched a workspace, captured desktop/mobile views, and reported no browser page errors. See the [landing page screenshot](portfolio-preview.png).

For the upgrade check, a disposable database was migrated to the prior revision, populated with an existing account, ticket and reply, then upgraded to head. Their IDs, content and relationships were checked after migration, and `alembic check` compared the final schema with the models.

## Reproduce

Follow the local startup instructions in [README](../README.md), then run the API checks from `backend` and the build/browser checks from `frontend`. Portfolio browser tests require DEMO_ENABLED=true on the API, VITE_DEMO_MODE=true on the frontend and DEMO_E2E=true for Playwright. Original tests require normal mode and the documented seeded accounts. Use separate disposable databases for these modes.

`PLAYWRIGHT_CHANNEL=chrome` uses an installed Chrome browser; otherwise install Playwright Chromium. `E2E_PORT` and `API_PROXY_TARGET` allow unused local ports. A hosted frontend can instead use VITE_API_BASE_URL for its separate API origin.

## Remaining deployment verification

- PostgreSQL-specific advisory/row-lock behavior, concurrent capacity enforcement, and real Neon connectivity were not executed locally; SQLite checks do not establish those properties.
- Docker Compose and the GitHub Actions template were not run. The workflow remains a template at `docs/github-actions-ci.yml`, not active CI.
- The Render blueprint and setup guide are prepared. No Render or Neon resources were created, and no public deployment has been verified.
- Actual free-host cold starts, HTTPS and assigned-domain CORS must be checked after deployment using [the deployment checklist](deploy-free.md#5-verify-the-public-demo).

The passing API run reports two dependency deprecation warnings from Starlette/httpx and AnyIO; neither failed the suite. Free-tier limits remain provider-controlled and are documented in the hosting guide.
