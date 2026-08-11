# backplane — deploy control plane + observability (#75)

Thin deploy control plane for the dev server: a project registry, git-driven
`docker compose` deploys, image-update detection, container status/logs, and a
Prometheus-backed metrics layer. **API-first** — the React UI and the MCP server
are equal clients of the same REST API, so agents can do everything the UI can.

## Architecture

- **Server** (`src/server/`): Hono on Node. All logic lives in `lib/`
  (registry, compose target, deployer, updates, docker, prometheus); routes in
  `routes/` only translate HTTP.
- **UI** (`src/ui/`): Vite + React SPA, built statically and served by the
  server process on the same port.
- **MCP** (`src/mcp/`): stdio MCP wrapping the REST API (same pattern as
  `apps/mcp`). Client-side process — not part of the compose stack.
- **Registry storage**: SQLite via `node:sqlite` (zero-dep) on the `/data`
  volume, alongside per-project git checkouts (`/data/workdirs/<project>`).

The backplane runs as its **own compose project** (`-p backplane`,
`docker-compose.yml` here) — never inside a stack it manages, since it must be
able to replace those stacks out from under themselves. It mounts the docker
socket and drives `docker compose` from outside.

## Running

### One-line install (needs only Docker)

```sh
curl -fsSL https://raw.githubusercontent.com/nazuraki/nazu/main/apps/backplane/install.sh | sh
```

Downloads the compose + Prometheus/Grafana config files, pulls the published
images, and starts the stack as compose project `backplane`. Prompts for the
install directory (Enter accepts `~/nazu-backplane`); non-interactive runs take
the default — seed it with `BACKPLANE_HOME`. Re-running updates to the latest
images — this **is** the self-update path on a machine installed this way. The
installer overwrites the downloaded files on each run — put customizations in
`docker-compose.override.yml`; `.env` (`BACKPLANE_API_KEY`, poll interval) is
never overwritten.

### From a checkout (local dev)

```sh
just backplane-up      # docker compose -p backplane -f apps/backplane/docker-compose.yml up -d --build
```

UI at `http://localhost:8430` (loopback-only), Prometheus at `:9090`, Grafana
at `:3001` (deep-dive/ad-hoc; inline UI charts come straight from Prometheus's
`query_range` through the API).

Env (all optional): `BACKPLANE_API_KEY` (bearer auth; open when unset),
`BACKPLANE_POLL_INTERVAL` (digest poll seconds, default 300, `0` = off),
`PROMETHEUS_URL`, `PORT`, `BACKPLANE_DATA_DIR`.

### HTTPS (tls profile)

The plain-HTTP listener binds to localhost only; LAN access goes through a
profile-gated caddy that serves `https://<host>` (mirrors the nazu stack's
tls profile). In `.env` set `BACKPLANE_HOSTNAME`, plus `BACKPLANE_TLS_CERT` /
`BACKPLANE_TLS_KEY` (absolute host paths, e.g. from mkcert), and
`COMPOSE_PROFILES=tls`, then `up -d` (or re-run the installer). Defaults to
ports 443 (HTTPS) and 80 (HTTP→HTTPS redirect); on a shared host override
with `BACKPLANE_HTTPS_PORT` / `BACKPLANE_HTTP_PORT`.

**Self-update** is the known chicken-and-egg: after pulling new backplane code,
re-run `just backplane-up` manually.

## Deploy model

A project registers a git repo + branch, watched image refs, and a `compose`
target (optional compose files/profiles/project name). Deploying:

1. clone or fetch+hard-reset the repo under `/data/workdirs/<name>`
2. `docker compose -p <name> [-f …] [--profile …] pull`
3. `… up -d --remove-orphans`

Git-driven rather than recreate-in-place so compose-file changes deploy too.
**Update** is the lighter sibling: pull + `up -d` against the existing checkout
(no git sync) — rolls containers to the newest pushed images without picking up
repo changes. Runs are serialized per project and recorded (status + full log)
in history.

Updates: the poller compares each watched image's remote manifest digest
(anonymous OCI token flow — public images) against the digests of running
containers; projects with `autoDeploy` redeploy automatically. CI can also push
deploys via webhook: `POST /api/projects/<name>/deploy?trigger=webhook` with the
API key. Private git repos aren't wired up yet — use public repos or bake
credentials into the image's git config.

### Self-update

The backplane can't `compose up` its own stack directly — recreating its own
container would kill the compose process mid-update. Instead, `POST
/api/self/update` (the "Update backplane" button in the UI, or the MCP
`self_update` tool) spawns a **detached one-shot helper container** running the
backplane's current image (which ships the docker CLI + compose plugin). The
helper pulls the new image and runs `docker compose up -d` against the host
paths recorded in the backplane container's own compose labels, so it survives
the recreation and needs zero extra configuration. `GET /api/self` reports
whether a newer image is published and the outcome (state, exit code, log tail)
of the last helper run. Re-running `install.sh` or `just backplane-update` on
the host remains equivalent.

## API

| Route | What |
|---|---|
| `GET /api/health` | liveness (unauthenticated) |
| `GET`/`POST /api/projects`, `GET`/`DELETE /api/projects/:name` | registry CRUD (POST upserts) |
| `GET /api/projects/:name/status` | compose services state |
| `GET /api/projects/:name/updates` | remote vs running image digests |
| `POST /api/projects/:name/deploy` / `update` / `restart` | queue a run (202 + history record) |
| `GET /api/projects/:name/deploys[/:id]` | history / record incl. log |
| `GET /api/self` | own image update status + last self-update outcome |
| `POST /api/self/update` | self-update via detached helper (202; 409 if running) |
| `GET /api/containers` | all containers on the host |
| `GET /api/containers/:id/logs?tail=&follow=1` | text tail or chunked live stream |
| `GET /api/metrics/query_range`, `/query` | Prometheus proxy |

## MCP

`node dist/mcp/server.js` (env `BACKPLANE_URL`, `BACKPLANE_API_KEY`). Tools:
`list_projects`, `project_status`, `deploy_project`, `update_project`,
`restart_project`, `deploy_status`, `self_status`, `self_update`,
`list_containers`, `container_logs`, `query_metrics`.

## Observability stack

Prometheus scrapes **cAdvisor** (per-container CPU/mem for every container on
the host, all compose projects) and **nazu's Caddy** metrics (host port 2020,
best-effort — target is down unless nazu's `tls` profile is active). Grafana OSS
(AGPLv3 — fine self-hosted) is linked out for ad-hoc exploration with the
Prometheus datasource provisioned. Zero egress; everything stays on the box.

## Future

- `aws` deploy-target adapter (ECS/App Runner) behind the same `DeployTarget`
  interface in `src/server/lib/targets/`.
- App-level instrumentation beyond Caddy's request metrics.
- nazu's dashboard sheds its container panel and links here.
