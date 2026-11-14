# Demo Accounts

Seed accounts created on the live deployment at **http://13.203.106.82/** by the
project's own `backend/apps/utils/management/commands/seed_erp.py` command (see
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md#seeding-demo-data)). Every name, email, and
org unit below is synthetic — `@northstar.example` is a documentation-reserved domain
(RFC 2606) that will never resolve, and "Northstar Enterprise Group" does not exist.

**These are evaluation credentials for a disposable demo environment, not real user
accounts.** Do not reuse any of these passwords elsewhere. If this deployment is ever
promoted beyond a demo, delete these accounts or rotate every password first (see
[`docs/SECURITY.md`](docs/SECURITY.md)).

Log in at http://13.203.106.82/login with any row below.

| Name | Username | Password | Role | Email |
| --- | --- | --- | --- | --- |
| (System account) | `erp_admin` | `xs2oMZRj` | System Admin | admin@northstar.example |
| Devika Rao | `devika.rao` | `QCuuh26W` | Department / Project Manager (Engineering Manager) | devika.rao@northstar.example |
| Ananya Mehta | `ananya.mehta` | `JCdf5u33` | HR Manager (People Operations Manager) | ananya.mehta@northstar.example |
| Rohan Kulkarni | `rohan.kulkarni` | `2vUF2R2A` | Employee (Senior Software Engineer) | rohan.kulkarni@northstar.example |
| Isha Nair | `isha.nair` | `7FceMQuX` | Employee (Product Analyst) | isha.nair@northstar.example |
| Kabir Shah | `kabir.shah` | `Mq3pTpyy` | Employee (Finance Analyst) | kabir.shah@northstar.example |

## What each account can show you

- **`erp_admin`** — org structure CRUD (Northstar Enterprise Group → Pune Technology
  Campus / Bengaluru Business Center / Mumbai Client Services Office branches →
  Engineering / People Operations / Finance / Product departments), manager hierarchy,
  org chart at `/admin/org-chart`.
- **`devika.rao`** — manages the Pune branch and heads Engineering; the other four
  employee accounts all report to her. Can see PM pages (`/pm/projects`, `/pm/tasks`,
  `/pm/team`), is the manager on both seeded projects, and can create performance
  scorecards for her reports.
- **`ananya.mehta`** — full employee directory/CRUD at `/organization`, leave and
  expense approvals, performance cycle management.
- **`rohan.kulkarni`** — assigned a task on "Northstar Customer Platform
  Modernization", has a pending leave request and a pending expense claim, has a laptop
  allocated to him.
- **`isha.nair`** — manages the Bengaluru branch, heads Product, is manager on
  "Enterprise Analytics Foundation", has an approved leave request.
- **`kabir.shah`** — manages the Mumbai branch, heads Finance, has an approved expense
  claim.

Re-running `seed_erp` on the server regenerates all five employee accounts above
(new random 8-character passwords each time) but preserves `erp_admin` and its
password once that account exists.
