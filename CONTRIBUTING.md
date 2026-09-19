# Contributing

Create a branch for a focused change, add meaningful regression coverage, and run the backend tests, lint, frontend build, and affected browser tests before opening a pull request.

Use fictional data only. Never commit `.env`, database dumps, access tokens, or actual government/organizational processes. New workflow rules belong in `backend/app/services.py`; do not rely on disabled frontend buttons for authorization.

For schema changes, update models and generate a new Alembic revision (`alembic revision --autogenerate -m "Describe change"`). Review the generated operations, then test the migration on a disposable database. Do not edit a migration that has already been deployed.

Keep the README's behavior and permission descriptions aligned with code. Include the problem, resulting behavior, and validation in pull request descriptions.
