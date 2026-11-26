# Security

Honest status of this specific deployment: what's in place, what's intentionally
simplified for a demo, and what to change before this would be a real production
deployment serving real users.

## What's in place

**Application**
- JWT auth (`djangorestframework-simplejwt`) — 60-minute access tokens, 1-day refresh,
  signed with a dedicated `JWT_SECRET_KEY` (not reused from Django's `SECRET_KEY`).
- Every API view sets explicit `permission_classes` per-app (`is_hr_or_admin` /
  `is_manager` / `get_employee` pattern in each app's `permissions.py`) — nothing relies
  on a global DRF default, since none is set (`REST_FRAMEWORK` has no
  `DEFAULT_PERMISSION_CLASSES`). That's a point worth hardening — see below.
- Per-endpoint throttling, including a dedicated login rate limit separate from general
  API traffic (`backend/core/settings.py`): `anon` 20/min, `user` 120/min, `login`
  5/min, `write_burst` 30/min.
- Audit logging middleware (`core.middleware.AuditLoggingMiddleware`) and soft-delete
  (`AuditBaseModel`) across every app — records are never hard-deleted, every mutation
  is attributed to a `created_by`/`updated_by` user.
- Optional Cloudflare Turnstile on login and account activation
  (`backend/apps/utils/turnstile.py`, `frontend/src/components/Turnstile.tsx`) — human
  verification, not just a password check, when configured for a real domain.
- `DEBUG=False`, `SECRET_KEY`/`JWT_SECRET_KEY`/Postgres password all freshly generated
  (50/50/24-byte random, via Python's `secrets` module) for this deployment — none are
  defaults, none are reused from any example or the local-dev `.env`.

**Infrastructure**
- `.env` (all secrets) lives only on the server, mode `600`, excluded from `rsync` and
  from git (`.gitignore` already covers `.env`/`.env.*`) — it was never transferred
  through or stored in this repository.
- Postgres and Redis are **not** exposed to the host or the internet — `docker-compose.yml`
  uses `expose`, not `ports`, for both; only Nginx publishes `80:80`. Confirmed on the
  running instance: `ss -tlnp` shows just `22` and `80` listening.
- The Django container runs as a non-root user (`backend/Dockerfile` creates and
  switches to a `django` user before `CMD`).
- SSH is key-only — `PasswordAuthentication no` in `sshd_config` (AL2023 default,
  verified on the instance) — and the EC2 security group only answers on 22/80 (TCP
  connections to any other port are dropped at the network level).
- Seed credentials were generated server-side, copied off the box once, then deleted
  from the container's filesystem (`rm -f /app/seed_credentials.txt`) rather than left
  sitting on disk.

## What's intentionally simplified for this demo

- **No HTTPS.** This is a bare IP address with no registered domain, so there's no
  hostname to issue a TLS certificate for (Let's Encrypt requires domain validation).
  All traffic — including login credentials — is plaintext HTTP. **This is the single
  biggest gap**: a network-path attacker can read JWTs and the login POST body.
  Fix: point a domain at this IP, add Certbot + an Nginx TLS server block (or put this
  behind a CDN/load balancer that terminates TLS), then set `SECURE_SSL_REDIRECT=True`,
  `SESSION_COOKIE_SECURE=True`, `CSRF_COOKIE_SECURE=True` in Django.
- **Turnstile is disabled.** Both `TURNSTILE_SECRET_KEY` (backend) and
  `VITE_TURNSTILE_SITE_KEY` (frontend) are unset. Turnstile widgets are bound to a
  registered domain in the Cloudflare dashboard, which this deployment doesn't have.
  `verify_turnstile_token()` treats "no secret configured" as "skip verification" by
  design (see its docstring) — correct for this deployment, but it means login/activation
  have no bot/abuse layer beyond the rate limits above.
- **Self-managed Postgres/Redis in containers on the same VM as the app**, not a managed
  database (RDS) with automated backups, point-in-time recovery, or patching. A `docker
  compose down -v` or a lost EBS volume loses all data. There is no backup job.
- **Single instance, no redundancy.** One VM, one AZ (`ap-south-1c`). If it goes down,
  the app is down. No load balancer, no auto-scaling, no health-check-driven recovery
  beyond Docker's `restart: unless-stopped`.
- **Demo account passwords are documented in plaintext** in
  [`../DEMO_ACCOUNTS.md`](../DEMO_ACCOUNTS.md), as requested, for evaluation convenience.
  This is **only acceptable because every one of these accounts is synthetic seed data**
  (fictional names, `@northstar.example` emails — a domain reserved by RFC 2606 for
  documentation, which will never resolve) created by `seed_erp`, not real employees. The
  same pattern must never be used for genuine user accounts.

## Before this goes anywhere near real users

1. **TLS**, as above — non-negotiable for anything handling real credentials.
2. **Rotate every secret** generated for this demo (`SECRET_KEY`, `JWT_SECRET_KEY`,
   Postgres password) if this instance is ever promoted beyond a demo — they were
   generated by this deployment session and are known to whoever ran it.
3. **Set `DEFAULT_PERMISSION_CLASSES: ['rest_framework.permissions.IsAuthenticated']`**
   in `REST_FRAMEWORK` as a safety net, so a future view that forgets `permission_classes`
   fails closed (401) instead of open (`AllowAny`) — belt-and-suspenders on top of the
   per-view scoping that's already there.
4. **Move Postgres to a managed service** (RDS or equivalent) for backups and failover,
   or at minimum add a scheduled `pg_dump` off-box.
5. **Re-enable Turnstile** once there's a real domain.
6. **Change every demo password** in `DEMO_ACCOUNTS.md`, or delete those accounts
   entirely, before treating this as anything other than a disposable evaluation
   environment.
7. Consider a WAF/CDN (e.g. Cloudflare in front of the domain from step 1) — there is
   currently nothing between the internet and Nginx except the EC2 security group.
