# 6. Apps join the shared edge network; per-app caddies retired

Date: 2026-08-19

## Status

Accepted

## Context

Every deployable stack in this repo (nazu, backplane, usr) grew its own
profile-gated Caddy for LAN HTTPS: per-app mkcert certs bind-mounted from the
host, `*_HOSTNAME` / `*_TLS_CERT` / `*_TLS_KEY` / `*_HTTP(S)_PORT` env vars,
and a published host port per app. That meant N cert/trust ceremonies, N port
assignments to keep collision-free on a shared host, and TLS knowledge
duplicated in every stack. Public access had already moved to a shared edge
stack (switchboard) that owns ports 80/443 and the Cloudflare Tunnel (#99);
during the transition it back-hauled to each app's published HTTPS port with
SNI/host pinning and verification disabled.

## Decision

The shared edge is the only TLS terminator and the only published entry
point. Each app stack:

- keeps its plain-HTTP listener bound to `127.0.0.1` for local dev;
- gains an opt-in `docker-compose.edge.yml` override that joins its
  front-facing service(s) to the pre-existing external `edge` docker network
  (created by the switchboard stack's host prep), under a stable name —
  `nazu` (aliased; the service is `web`), `usr`, `backplane`, `grafana`,
  `prometheus`;
- drops its Caddy service, TLS env vars, and published HTTPS/redirect ports.

The switchboard Caddy reverse-proxies each vhost to the container name over
`edge` and stamps `X-Access-Scope: lan|external`. Local dev never activates
the override, so a fresh `docker compose up` still needs no `.env` and no
external network.

Consequences per stack:

- **nazu** — the `tls` optional service (and its generated-Caddyfile
  `prepare()` machinery, `caddy_config`/`caddy_data` volumes) is deleted from
  compose and `services.ts`. Because the web app shells out to
  `docker compose` for the optional-service toggles, the edge override is
  mirrored into the container and `COMPOSE_FILE` lists both files — otherwise
  an in-app `up` would recreate `web` from the base file alone and detach it
  from `edge`. `services.ts` splits `COMPOSE_FILE` on `:` accordingly. On the
  server, the backplane project config lists both compose files.
- **usr** — Caddy service and `apps/usr/caddy/` deleted; the backplane
  project config lists `apps/usr/docker-compose.{yml,edge.yml}`.
- **backplane** — Caddy service and `apps/backplane/caddy/` deleted; grafana
  and prometheus become loopback-published and join `edge` alongside
  `backplane`. The Prometheus `caddy` job now scrapes the switchboard Caddy's
  `:2020` metrics listener over `edge` instead of nazu's Caddy on host port
  2020 (nazu no longer has one). The installer fetches the override and
  enables it via `COMPOSE_FILE` in `.env`; the self-update helper inherits it
  automatically from the compose config-files container label.

## Consequences

- One wildcard certificate at the edge replaces per-app mkcert certs; no
  client trust ceremony, no cert renewals inside app stacks.
- Apps publish no LAN-facing ports; the per-app `*_TLS_*` / `*_HTTP(S)_PORT`
  env vars and port-collision bookkeeping disappear.
- Compose service names become addresses on a shared network, so they must be
  unique across participating stacks (hence the `nazu` alias for `web`).
- App containers on `edge` can reach each other directly; isolation between
  stacks now relies on app-level auth, as it already did for LAN clients.
- The edge stack is a single point of failure for all remote access; local
  loopback ports remain as the escape hatch.
- Rollback is per-app: restore the app's Caddy service and point the edge
  back at the published port (the interim backhaul pattern).
