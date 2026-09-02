# Custom Employee Portal with Zoho One Integration

A web portal with its own authentication and role-based access control. Employees
sign in with portal credentials, and the dashboard shows only the Zoho One
applications their role authorises. Zoho is reached through a single service
account held on the server — no employee ever has a Zoho username or password.

## Stack

| Layer    | Choice                                                                |
| -------- | --------------------------------------------------------------------- |
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS v4                     |
| Backend  | Next.js Route Handlers on Node.js — auth, RBAC engine, Zoho API layer  |
| Database | PostgreSQL (Supabase), accessed server-side with the service role key  |
| Auth     | JWT in an httpOnly cookie, bcrypt password hashes, revocable sessions  |

## Setup

### 1. Environment

Copy `.env.example` to `.env` and fill it in. `npm run zoho:bootstrap` can
produce the Zoho values — see [Zoho credentials](#zoho-credentials) below.

### 2. Database

Open the Supabase dashboard → **SQL Editor** → paste the contents of
[`supabase/schema.sql`](supabase/schema.sql) → **Run**.

This creates seven tables — `users`, `roles`, `permissions`, `user_roles`,
`role_permissions`, `sessions`, `audit_logs` — and enables row level security
with no policies, so nothing but the server's service role can read them.

### 3. Seed roles and demo users

```bash
npm install
npm run db:seed
```

The seed is idempotent. It creates the permission catalogue, seven system
roles, and one demo user per role:

| Email                  | Password       | Role     | Sees                    |
| ---------------------- | -------------- | -------- | ----------------------- |
| admin@portal.test      | `Admin@12345`  | Admin    | Everything + admin area |
| manager@portal.test    | `Portal@123`   | Manager  | Sales team report       |
| hr@portal.test         | `Portal@123`   | HR       | Zoho People             |
| sales@portal.test      | `Portal@123`   | Sales    | Zoho CRM                |
| support@portal.test    | `Portal@123`   | Support  | Zoho Desk               |
| finance@portal.test    | `Portal@123`   | Finance  | Zoho Books              |
| employee@portal.test   | `Portal@123`   | Employee | Nothing (empty state)   |

Change these before any real deployment.

### 4. Run

```bash
npm run dev      # http://localhost:3000
```

## How access control works

A **user** holds any number of **roles**; a role grants **permissions**; a
permission whose `zoho_app` is set unlocks one dashboard tile.

```
user → user_roles → role → role_permissions → permission → Zoho app tile
```

Four permissions map to the four applications named in the brief:

| Role    | Permission            | Zoho application | Purpose                         |
| ------- | --------------------- | ---------------- | ------------------------------- |
| HR      | `zoho.people.access`  | Zoho People      | HR management functions         |
| Sales   | `zoho.crm.access`     | Zoho CRM         | Sales and customer relationships |
| Support | `zoho.desk.access`    | Zoho Desk        | Support ticketing and cases     |
| Finance | `zoho.books.access`   | Zoho Books       | Financial and accounting        |

Every authenticated request resolves roles and permissions **from the database,
not from the JWT** (`src/lib/auth/session.ts`). Revoking a role therefore takes
effect on the user's next request rather than when their token expires.

Enforcement lives in `requirePermission()` (`src/lib/api.ts`) for API routes and
`hasPermission()` for pages. `src/proxy.ts` — Middleware, renamed to Proxy in
Next.js 16 — only does an optimistic cookie check to avoid a protected-shell
flash; it is never the authorisation boundary.

## Security

- **Passwords** — bcrypt, cost 10. Login answers identically for an unknown
  email and a wrong password so accounts cannot be enumerated.
- **Sessions** — the JWT carries a `jti` matching a `sessions` row. Logout,
  deactivation, a password change, and any role or permission change revoke
  those rows, so a stolen token stops working immediately.
- **Timeouts** — the JWT expires after `JWT_EXPIRES_IN` (1h). Independently,
  a session dies after 30 minutes of inactivity, enforced on the server and
  mirrored in the browser.
- **Cookies** — httpOnly, sameSite=lax, and `secure` in production.
- **HTTPS** — HSTS plus `nosniff`, `DENY` framing and a strict referrer policy,
  set in `next.config.ts`.
- **Zoho tokens** — the refresh token never leaves the server. Access tokens are
  cached in memory and refreshed early, so employee traffic never triggers a
  token exchange per request.
- **Audit** — sign-ins (including failures), Zoho access, denied attempts, and
  every administrative change are written to `audit_logs` with actor, IP and
  user agent.

## Zoho credentials

`npm run zoho:bootstrap` turns a grant code into a permanent refresh token and
discovers the Books and Desk organisation IDs.

1. At <https://api-console.zoho.in>, open your Self Client → **Generate Code**
   with the scopes:

   ```
   ZohoBooks.fullaccess.all,Desk.tickets.ALL,Desk.contacts.READ,Desk.basic.READ,Desk.settings.READ,ZohoCRM.modules.ALL,ZohoCRM.settings.READ,ZohoPeople.employee.ALL,ZohoPeople.forms.ALL
   ```

2. Immediately (codes expire in minutes):

   ```bash
   npm run zoho:bootstrap -- <grant-code> --write
   ```

To re-read organisation IDs later without a new code:

```bash
npm run zoho:bootstrap -- --orgs --write
```

Two Zoho constraints worth knowing: **scopes are frozen into a refresh token**,
so adding an application means generating a new code with the full list; and a
client is capped at **20 refresh tokens**, with the oldest silently invalidated
beyond that.

An application that is not provisioned on the Zoho account returns
`OAUTH_SCOPE_MISMATCH` or an empty list. The portal surfaces this on the app's
page as a warning with the remedy, rather than failing the whole dashboard.

## API

| Method | Route                      | Permission          |
| ------ | -------------------------- | ------------------- |
| POST   | `/api/auth/login`          | public              |
| POST   | `/api/auth/logout`         | authenticated       |
| GET    | `/api/auth/me`             | authenticated       |
| GET    | `/api/zoho/[app]`          | that app's `zoho.*` |
| GET    | `/api/team`                | `team.reports.read` |
| GET    | `/api/admin/users`         | `admin.users.read`  |
| POST   | `/api/admin/users`         | `admin.users.write` |
| PATCH  | `/api/admin/users/[id]`    | `admin.users.write` |
| DELETE | `/api/admin/users/[id]`    | `admin.users.write` |
| GET    | `/api/admin/roles`         | `admin.roles.read`  |
| POST   | `/api/admin/roles`         | `admin.roles.write` |
| PATCH  | `/api/admin/roles/[id]`    | `admin.roles.write` |
| DELETE | `/api/admin/roles/[id]`    | `admin.roles.write` |
| GET    | `/api/admin/permissions`   | `admin.roles.read`  |
| GET    | `/api/admin/audit`         | `admin.audit.read`  |

## Layout

```
src/
  proxy.ts                  optimistic cookie check (Next 16 Middleware)
  lib/
    env.ts                  validated environment access
    supabase.ts             service-role client, server-only
    api.ts                  requireUser / requirePermission / guard
    audit.ts                audit writer
    auth/                   password, jwt, session, rbac, permission catalogue
    zoho/                   token cache, HTTP client, app registry, access layer
    admin/queries.ts        read models shared by pages and API routes
  app/
    login/                  sign-in
    (portal)/dashboard/     tiles + per-application data view
    (portal)/team/          manager's department report
    (portal)/admin/         users, roles, audit log
    api/                    route handlers
supabase/schema.sql         database schema
scripts/zoho-bootstrap.mjs  grant code -> refresh token + org IDs
scripts/seed.mjs            roles, permissions, demo users
```
