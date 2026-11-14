# Northstar ERP — Project Overview

## 1. Introduction

Northstar ERP is a role-based enterprise resource planning system for a multi-branch
company. It covers the day-to-day HR/ops surface area a mid-size company needs: who
reports to whom, who works where, leave and expense approvals, asset issuance, project and
task tracking, attendance, and periodic performance reviews — all behind a single
JWT-authenticated React frontend talking to a Django REST API.

**Stack**

| Layer | Technology |
| --- | --- |
| Backend | Django 6.1 + Django REST Framework, PostgreSQL, Redis (cache, optional) |
| Auth | JWT (`djangorestframework-simplejwt`), Cloudflare Turnstile on login/activation (optional) |
| Frontend | React 19 + TypeScript, Vite, Tailwind, React Router |
| Infra | Docker Compose (Postgres, Redis, Gunicorn, Nginx) |

## 2. Domain model (the org hierarchy everything else hangs off)

```
Company
 └─ Branch (has a manager — an Employee)
     └─ Department (has a head — an Employee)
         └─ Team

User (login identity: username/password, Role) ──1:1── Employee (person record: name,
                                                          job title, department, manager,
                                                          hire/resignation date, status)
```

Every other module (leave, expense, assets, projects, performance, attendance) hangs a
foreign key off `Employee`, and most permission checks reduce to: *is this user HR/Admin,
the employee themself, or their direct manager?*

## 3. Roles and what each one sees

| Role | Primary surface |
| --- | --- |
| **System Admin** | Full org structure CRUD (companies/branches), manager hierarchy, org chart, read-only employee directory |
| **HR Manager** | Full employee CRUD + credential provisioning, departments/teams, leave/expense approval, performance cycles |
| **Department / Project Manager** | Their team's projects/tasks, availability, calendar, scorecards for direct reports |
| **Employee** | Own profile, leave requests, expense claims, attendance, performance scorecards (submitted only) |

Every list page is the same `AdminEmployeeDirectoryPage`/`OrganizationPage`-style table
under the hood, scoped differently per role via DRF permission classes — not separate
codepaths per role.

## 4. Request flow (how a page actually gets data)

1. **Login** — `POST /api/users/auth/token/` with username/password (+ Turnstile token if
   configured) returns a JWT access/refresh pair. The access token is attached as a
   `Authorization: Bearer` header on every subsequent request (`frontend/src/api/axios.ts`);
   a 401 triggers a silent refresh via `/api/users/auth/token/refresh/` and retries once.
2. **Role-gated routing** — `AuthContext` decodes the JWT's `role` claim on load;
   `frontend/src/App.tsx` wraps admin/HR/PM-only routes in a `RoleRoute` that redirects
   anyone without the right role.
3. **Per-app REST surface** — each Django app under `backend/apps/` (`users`,
   `organization`, `projects`, `assets`, `leave`, `expense`, `performance`, `attendance`,
   `analytics`, `notifications`) exposes its own `ViewSet`s under `/api/<app>/...`, each with
   its own `permissions.py` (the `is_hr_or_admin` / `is_manager` / `get_employee` pattern
   repeated per app rather than one shared mega-permission class).
4. **State-changing actions go through `services.py`**, not directly in the view — e.g.
   submitting a performance scorecard (`apps/performance/services.py`) validates status,
   rating, and cycle state, then fires a notification
   (`apps/notifications/services.py`).
5. **Analytics** (`apps/analytics/views.py`'s `dashboard_summary`) aggregates across all of
   the above with `Count`/`Avg` queries scoped by role, for the dashboard and the HR/Admin
   rollups.

## 5. Where to go next

- **Deployment**: [`DEPLOYMENT.md`](DEPLOYMENT.md)
- **Security posture of this deployment**: [`SECURITY.md`](SECURITY.md)
- **Demo account credentials**: [`../DEMO_ACCOUNTS.md`](../DEMO_ACCOUNTS.md)
- **Local dev setup**: [`../README.md`](../README.md)
- **Phased work log / what's done, what's flagged**: [`../PLAN_README.md`](../PLAN_README.md)
