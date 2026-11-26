# Northstar ERP

A Django REST + React ERP system (organization hierarchy, employees, leave/expense,
assets, attendance, performance reviews, analytics).

**Live demo:** http://13.203.106.82/ — see [`DEMO_ACCOUNTS.md`](DEMO_ACCOUNTS.md) for
login credentials.

This file covers local development setup only. For the rest of the docs:

- [`docs/PROJECT_OVERVIEW.md`](docs/PROJECT_OVERVIEW.md) — what this is, the domain
  model, roles, and request flow
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — how the live demo was deployed and how to
  update/operate it
- [`docs/SECURITY.md`](docs/SECURITY.md) — security posture of that deployment, honestly
- [`DEMO_ACCOUNTS.md`](DEMO_ACCOUNTS.md) — seeded demo account credentials

## Prerequisites

- Python 3.13+ and [`uv`](https://docs.astral.sh/uv/)
- Node.js >= 22.12 (see [`frontend/.nvmrc`](frontend/.nvmrc))
- PostgreSQL 16 (native install, or via the dev-only [`docker-compose.yml`](docker-compose.yml) at the repo root)
- Redis (optional — the app falls back gracefully to no caching if Redis is unreachable)

## 1. Database and cache

Either install Postgres 16 (and optionally Redis) natively, or start them with Docker:

```bash
docker compose up -d
```

This starts Postgres on `127.0.0.1:5433` and Redis on `127.0.0.1:6379`, matching the
example `.env` values below. (It does **not** run the Django app or Nginx — that stack,
used for production, lives in [`deploy/docker-compose.yml`](deploy/docker-compose.yml).)

## 2. Environment variables

Copy the example and fill in real values:

```bash
cp .env.example .env
```

At minimum for local dev you need a `SECRET_KEY`, `JWT_SECRET_KEY`, and the `POSTGRES_*`
variables pointing at the database from step 1. `TURNSTILE_SECRET_KEY` can be left unset —
Turnstile verification is skipped automatically when no secret is configured
(see `backend/apps/utils/turnstile.py`).

## 3. Backend

```bash
cd backend
uv sync
uv run python manage.py migrate
uv run python manage.py createsuperuser
uv run python manage.py runserver
```

The API is served at `http://127.0.0.1:8000/`. Run the test suite with:

```bash
uv run python manage.py test
```

## 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

Create `frontend/.env.local` with a `VITE_TURNSTILE_SITE_KEY` if you want the Turnstile
widget to render on the login/activation pages (optional for local dev, since the backend
skips verification without a secret key). The dev server runs at `http://127.0.0.1:5173/`
and talks to the backend at `http://127.0.0.1:8000/api/` by default.

Useful scripts: `npm run lint` (oxlint), `npm run typecheck` (`tsc --noEmit`), `npm run build`.

## Known dead code

Two directories under `backend/` are leftovers from an earlier project layout and are not
wired into `INSTALLED_APPS` or imported anywhere:

- `backend/users/` — a single orphaned migration file from before the app was moved to
  `apps/users/`. Safe to delete.
- `backend/src/backend/__init__.py` — a `uv init --package` scaffold stub. It's referenced
  by the `[project.scripts]` entry in `backend/pyproject.toml`, but nothing in this project
  (dev server, tests, Docker image, CI) calls that console script — Gunicorn runs
  `core.wsgi:application` directly. Removing both the directory and the `[project.scripts]`
  entry together is safe, but wasn't done here to keep this pass non-destructive; flagged
  for a deliberate cleanup commit.
