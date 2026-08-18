# ADR 0004: usr — centralized user management

## Status

Accepted (2026-08-18).

## Context

Identity across the nazu ecosystem was ephemeral: each app derived a user from
its own auth ladder (OAuth email, CF Access header, local admin, API key) with
no persistent user store, no roles, and no permissions anywhere. There was no
way to provision a user before their first login, and no single place another
app could ask "what may this person do?".

## Decision

Add `apps/usr/`, a standalone user-management app:

- **Stack:** Hono + React SPA, mirroring the backplane's API-first shape (all
  logic in `src/server/lib/`, routes translate HTTP, the SPA and any machine
  client are equal REST consumers).
- **Storage:** its own Postgres in its own compose project
  (`apps/usr/docker-compose.yml`, project name `usr`) — not the nazu stack's
  database. Plain-SQL migrations applied idempotently at boot.
- **Model:** users (by email) × app-scoped roles × permission strings.
  Apps are plain string namespaces; no app registry. Admins pre-provision
  users by email and assign roles before first login; OAuth sign-in succeeds
  only for provisioned emails (usr is the roster, not a signup page).
- **Query API:** `GET /api/permissions?email=&app=` returns roles + effective
  permissions; unknown emails are `200` + `exists:false`. Other apps call it
  with the static `USR_API_KEY`.
- **Auth:** the nazu-web ladder rebuilt for Hono — API key → session cookie
  (hand-rolled GitHub/Google authorization-code flow; provider credentials
  DB-backed and edited in-app) → Basic (local admin) → zero-conf open mode.
  No auth library: `@auth/sveltekit` doesn't fit Hono and the code flow is
  small; scrypt password format matches the siblings.
- **usr dogfoods its own model:** authorization is a per-action `can()` check
  against `usr`-app grants (`users:read`/`users:write`, `roles:*`,
  `settings:*`), so partial admin is grantable; `admin` (seeded `usr/admin`
  role) is the umbrella satisfying every check. The API key, open mode, and
  the break-glass local credentials are **root** identities outside the roles
  model and bypass checks — there is no admin boolean on identities.
- **First-run setup:** on a fresh install (no users, no credentials) the SPA
  shows a welcome screen that creates the initial admin as a real users row
  with `usr/admin` assigned, and links the local break-glass credentials to
  it — so even the bootstrap identity has a profile and follows the model.
- **Deploy:** published by CI as `ghcr.io/nazuraki/nazu-usr`, registered in the
  backplane as its own compose project; HTTPS via the same caddy `tls`-profile
  pattern as the nazu and backplane stacks.

## Consequences

- Apps can adopt shared permissions incrementally: query usr where they need
  authorization; their own login flows keep working unchanged.
- usr becomes security-sensitive infrastructure — it must stay up for apps
  that hard-depend on its answers; callers should fail closed but cache.
- Roles/permissions are free-form strings by design; consistency across apps
  is a convention, not a schema guarantee.
- A future step could move the nazu web app's OAuth config to usr, or add
  token issuance (JWT) so apps can verify without a round trip. Out of scope
  here.
