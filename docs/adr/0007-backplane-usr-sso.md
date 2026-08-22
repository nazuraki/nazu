# 7. Backplane browser auth moves to usr SSO; local accounts retired

Date: 2026-08-22

## Status

Accepted

## Context

The backplane shipped its own browser auth: a single local admin account
(scrypt-hashed in the registry DB), 30-day session cookies, HTTP Basic, and a
static bearer key for agents. usr (ADR 0004) then became the roster for every
app, and its cross-app SSO (#108) lets any sibling app under the shared parent
domain authenticate a browser offline from the signed `nz_id` cookie. Keeping a
second, unrelated identity in the backplane meant a second password to rotate,
no per-user attribution, and no way to revoke access centrally.

## Decision

- The backplane's browser auth is usr SSO only. The auth ladder is **bearer
  key → `nz_id` cookie → open** (open only when neither `BACKPLANE_API_KEY` nor
  `BACKPLANE_USR_URL` is set). Local accounts, sessions, Basic and password
  hashing are removed; the registry drops the `sessions` table.
- Authorization is coarse: any role in the `backplane` app (`BACKPLANE_USR_APP`)
  in the token's `grants` admits the identity; absent key = no access. Finer
  per-route permissions can follow without changing the transport.
- Verification is offline against usr's JWKS (`node:crypto`, no new
  dependency), cached with refetch on unknown `kid`. The backplane never calls
  usr per request.
- The SPA owns the redirect: `/api/auth/status` returns the identity (even when
  ungranted) and usr's refresh URL; no cookie → bounce to usr, valid cookie
  without a grant → "no access" page. `/api/*` still answers plain 401 JSON.
- `BACKPLANE_API_KEY` stays as the agent/MCP path and the break-glass path when
  usr is unreachable.

## Consequences

- One login for usr, nazu and the backplane; role edits propagate at the
  token TTL (usr default 30 min); revocation is a role removal in usr.
- Requires both apps under one parent domain with usr's
  `USR_SSO_COOKIE_DOMAIN` set; local dev without usr runs open or key-only.
- If usr is down, browsers can't sign in — only the bearer key works. The
  backplane is the thing that redeploys usr, so the key must be kept somewhere
  reachable.
- The generic verifier in `apps/backplane/src/server/lib/sso.ts` is the
  template for converting the nazu web app next.
