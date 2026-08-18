# usr — user management

Centralized users, roles and permissions for all apps. One place to:

- edit your own profile,
- pre-provision users by email and assign roles/permissions across apps,
- let every app query effective permissions over REST.

Hono API + React SPA (API-first: all logic in `src/server/lib/`, routes only
translate HTTP, the SPA is a plain REST client). Its own Postgres; plain-SQL
migrations in `migrations/` applied at boot.

## Concepts

- **Apps** are string namespaces (`nazu`, `backplane`, …) — no registration.
- **Roles** are named per app and carry a set of permission strings.
- **Users** are identified by email. An admin creates them before first login;
  OAuth sign-in only succeeds for provisioned emails.
- **usr authorizes itself through its own model, per action:** admin routes
  require `users:read`/`users:write`, `roles:read`/`roles:write`, or
  `settings:read`/`settings:write` in the `usr` app — so partial grants work
  (e.g. a role with only `users:read` is a read-only directory). `admin`
  (seeded role `usr/admin`) is the grantable umbrella satisfying all of them.
  The API key, open mode, and the break-glass local credentials are **root** —
  identities outside the roles model that bypass checks.
- **First run:** with no users and no credentials configured, the UI shows a
  welcome screen that creates the initial admin — a real users row holding
  `usr/admin`, with the local (break-glass) credentials linked to it.

## Auth

Same ladder as the nazu web app: static API key (`USR_API_KEY` env, header
`x-api-key` or bearer) → session cookie (OAuth GitHub/Google or local login) →
Basic (local admin) → zero-conf open mode when nothing is configured. OAuth
credentials are DB-backed and edited in Settings; callback URLs are
`/api/auth/oauth/<provider>/callback`.

## The hot path

```
GET /api/permissions?email=<email>&app=<app>
→ { "email": "…", "app": "…", "exists": true, "roles": ["editor"], "permissions": ["write"] }
```

Unknown emails return `200` with `exists: false` and empty arrays. Omit `app`
to get grants keyed by app.

## Run

```bash
docker compose -f apps/usr/docker-compose.yml -p usr up -d --build
# UI/API on http://127.0.0.1:8432 (loopback only)
```

Local dev: `just usr-dev` (server, tsx watch) + `just usr-dev-ui` (vite, proxies
`/api` to :8432). Postgres from the compose stack is published on
`127.0.0.1:5434` (`DATABASE_URL=postgres://usr:usr@localhost:5434/usr`).

HTTPS: enable the `tls` profile and set `USR_HOSTNAME`, `USR_TLS_CERT`,
`USR_TLS_KEY` (and `USR_HTTPS_PORT` / `USR_HTTP_PORT` on shared hosts) in the
host's `.env` — mirrors the nazu and backplane stacks.

## Backplane deployment

Register as its own project (the image is published by CI as
`ghcr.io/nazuraki/nazu-usr`):

```json
{
  "name": "usr",
  "gitUrl": "https://github.com/nazuraki/nazu.git",
  "branch": "main",
  "images": ["ghcr.io/nazuraki/nazu-usr:latest"],
  "autoDeploy": true,
  "target": {
    "type": "compose",
    "projectName": "usr",
    "composeFiles": ["apps/usr/docker-compose.yml"]
  }
}
```
