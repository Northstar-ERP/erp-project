#!/usr/bin/env bash
# Start the Northstar ERP dev stack: Django backend (:8000) + Vite frontend (:5173).
#
# Usage:
#   ./run.sh              # install deps if needed, then start both servers
#   ./run.sh --migrate    # also apply database migrations first
#   ./run.sh --redis      # also start Redis via docker compose (optional)
#
# Press Ctrl+C to stop both servers.
# Note: migrations are opt-in because the database in .env may be shared.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

MIGRATE=0
REDIS=0
for arg in "$@"; do
  case "$arg" in
    --migrate) MIGRATE=1 ;;
    --redis) REDIS=1 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)"; exit 1 ;;
  esac
done

say() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

# --- Prerequisites -----------------------------------------------------------
command -v uv  >/dev/null 2>&1 || die "uv is not installed (https://docs.astral.sh/uv/)."
command -v npm >/dev/null 2>&1 || die "Node.js / npm is not installed."
[ -f "$ROOT/.env" ] || die "Missing $ROOT/.env - copy .env.example and fill in the database settings."

# --- Optional Redis ----------------------------------------------------------
if [ "$REDIS" = 1 ]; then
  command -v docker >/dev/null 2>&1 || die "--redis needs Docker."
  say "Starting Redis..."
  (cd "$ROOT" && docker compose up -d redis)
fi

# --- Dependencies ------------------------------------------------------------
say "Syncing backend dependencies (uv sync)..."
(cd "$BACKEND" && uv sync --quiet)

if [ ! -d "$FRONTEND/node_modules" ] || [ "$FRONTEND/package-lock.json" -nt "$FRONTEND/node_modules" ]; then
  say "Installing frontend dependencies (npm install)..."
  (cd "$FRONTEND" && npm install --no-audit --no-fund)
fi

# --- Database ----------------------------------------------------------------
if [ "$MIGRATE" = 1 ]; then
  say "Applying migrations..."
  (cd "$BACKEND" && uv run python manage.py migrate)
else
  (cd "$BACKEND" && uv run python manage.py check >/dev/null) || die "Django system check failed."
fi

# --- Start servers -----------------------------------------------------------
PIDS=()
cleanup() {
  echo
  say "Stopping servers..."
  for pid in "${PIDS[@]}"; do
    if command -v taskkill >/dev/null 2>&1; then
      taskkill //PID "$pid" //T //F >/dev/null 2>&1 || true   # Windows (Git Bash)
    else
      pkill -P "$pid" 2>/dev/null || true
      kill "$pid" 2>/dev/null || true
    fi
  done
}
trap cleanup EXIT INT TERM

say "Starting backend  -> http://127.0.0.1:8000/api/"
(cd "$BACKEND" && exec uv run python manage.py runserver 127.0.0.1:8000) &
PIDS+=($!)

say "Starting frontend -> http://127.0.0.1:5173"
(cd "$FRONTEND" && exec npm run dev -- --host 127.0.0.1 --port 5173) &
PIDS+=($!)

say "Both servers running. Press Ctrl+C to stop."
wait
