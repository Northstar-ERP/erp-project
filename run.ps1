<#
.SYNOPSIS
  Start the Northstar ERP dev stack: Django backend (:8000) + Vite frontend (http://localhost:5173/login).

.EXAMPLE
  .\run.ps1              # install deps if needed, then start both servers
  .\run.ps1 -Migrate     # also apply database migrations first
  .\run.ps1 -Redis       # also start Redis via docker compose (optional)

  Press Ctrl+C to stop both servers.
  Migrations are opt-in because the database in .env may be shared.

  If scripts are blocked, run once:
    Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
#>
param(
  [switch]$Migrate,
  [switch]$Redis
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Backend = Join-Path $Root 'backend'
$Frontend = Join-Path $Root 'frontend'

function Say($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Die($msg) { Write-Host "Error: $msg" -ForegroundColor Red; exit 1 }

# --- Prerequisites -----------------------------------------------------------
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) { Die 'uv is not installed (https://docs.astral.sh/uv/).' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Die 'Node.js / npm is not installed.' }
if (-not (Test-Path (Join-Path $Root '.env'))) { Die "Missing $Root\.env - copy .env.example and fill in the database settings." }

# --- Optional Redis ----------------------------------------------------------
if ($Redis) {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Die '-Redis needs Docker.' }
  Say 'Starting Redis...'
  Push-Location $Root; docker compose up -d redis; Pop-Location
}

# --- Dependencies ------------------------------------------------------------
Say 'Syncing backend dependencies (uv sync)...'
Push-Location $Backend
uv sync --quiet
if ($LASTEXITCODE -ne 0) { Pop-Location; Die 'uv sync failed.' }
Pop-Location

$nodeModules = Join-Path $Frontend 'node_modules'
$lockFile = Join-Path $Frontend 'package-lock.json'
if (-not (Test-Path $nodeModules) -or ((Get-Item $lockFile).LastWriteTime -gt (Get-Item $nodeModules).LastWriteTime)) {
  Say 'Installing frontend dependencies (npm install)...'
  Push-Location $Frontend
  npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Pop-Location; Die 'npm install failed.' }
  Pop-Location
}

# --- Database ----------------------------------------------------------------
Push-Location $Backend
if ($Migrate) {
  Say 'Applying migrations...'
  uv run python manage.py migrate
  if ($LASTEXITCODE -ne 0) { Pop-Location; Die 'Migrations failed.' }
} else {
  uv run python manage.py check | Out-Null
  if ($LASTEXITCODE -ne 0) { Pop-Location; Die 'Django system check failed.' }
}
Pop-Location

# --- Start servers -----------------------------------------------------------
Say 'Starting backend  -> http://127.0.0.1:8000/api/'
$backendProc = Start-Process -FilePath 'uv' -ArgumentList 'run', 'python', 'manage.py', 'runserver', '127.0.0.1:8000' `
  -WorkingDirectory $Backend -NoNewWindow -PassThru

Say 'Starting frontend -> http://localhost:5173/login'
# --strictPort: fail instead of silently moving to 5174 (backend CORS expects 5173).
# --open: open the browser at the login page once Vite is ready.
$frontendProc = Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'dev', '--', '--host', 'localhost', '--port', '5173', '--strictPort', '--open', '/login' `
  -WorkingDirectory $Frontend -NoNewWindow -PassThru

Say 'Both servers running. Press Ctrl+C to stop.'
try {
  while (-not $backendProc.HasExited -and -not $frontendProc.HasExited) {
    Start-Sleep -Seconds 1
  }
  if ($backendProc.HasExited) { Write-Host 'Backend stopped unexpectedly.' -ForegroundColor Yellow }
  if ($frontendProc.HasExited) { Write-Host 'Frontend stopped unexpectedly.' -ForegroundColor Yellow }
} finally {
  Say 'Stopping servers...'
  foreach ($p in @($backendProc, $frontendProc)) {
    if ($p -and -not $p.HasExited) {
      # /T kills the whole tree (Django's autoreloader child, Vite's node process).
      taskkill /PID $p.Id /T /F | Out-Null
    }
  }
}
