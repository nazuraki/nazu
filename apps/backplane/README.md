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
  server process on the same port. Styled by the shared design system
  ([ui-std-lib](https://github.com/nazuraki/ui-std-lib): `@nazuraki/styles`
  neon-butterfly theme + `@nazuraki/ui-react` components from npmjs);
  `styles.css` holds only app layout, written on `--nb-*` tokens.
- **MCP** (`src/mcp/`): stdio MCP wrapping the REST API (same pattern as
  `apps/mcp`). Client-side process — not part of the compose stack.
- **Registry storage**: SQLite via `node:sqlite` (zero-dep) on the `/data`
  volume. Per-project git checkouts live under `$BACKPLANE_WORKDIRS` on the
  **host**, bind-mounted into the container at the identical path (see
  "Deploy model").

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
`docker-compose.override.yml`; `.env` (`BACKPLANE_API_KEY`, `BACKPLANE_USR_URL`, poll interval) is
never overwritten.

### From a checkout (local dev)

```sh
just backplane-up      # docker compose -p backplane -f apps/backplane/docker-compose.yml up -d --build
```

UI at `http://localhost:8430` (loopback-only), Prometheus at `:9090`, Grafana
at `:3001` (deep-dive/ad-hoc; inline UI charts come straight from Prometheus's
`query_range` through the API).

Env (all optional): `BACKPLANE_API_KEY` (static bearer key for agents/MCP),
`BACKPLANE_USR_URL` / `BACKPLANE_USR_APP` (usr SSO for browsers — see "Auth"),
`BACKPLANE_POLL_INTERVAL` (digest poll seconds, default 300, `0` = off),
`BACKPLANE_GITHUB_TOKEN` (GitHub PAT for private repos/images — see
"Private repos and images"), `BACKPLANE_WORKDIRS` (host root for deploy
checkouts — see "Deploy model"; the installer pins it to `<install
dir>/workdirs`, and from a checkout it defaults to `${PWD}/workdirs`),
`PROMETHEUS_URL`, `PORT`, `BACKPLANE_DATA_DIR`.

### Auth

Zero-conf open by default. Two independent gates; configuring either one
locks down every `/api/*` route (except `/api/health` and `/api/auth/status`):

- **usr SSO (`BACKPLANE_USR_URL`)** — browsers authenticate with the
  cross-app `nz_id` cookie that [usr](../usr/README.md#cross-app-sso) sets on
  the shared parent domain. The backplane verifies it offline against usr's
  JWKS (cached 5 min, refetched on key rotation) and admits identities holding
  any role in the `backplane` app (`BACKPLANE_USR_APP` to rename). With no or
  an expired cookie the SPA bounces to usr's `/api/auth/sso/refresh`, which
  re-mints from the live usr session (or shows usr's login) and returns.
  A valid cookie without a backplane role shows "no access" instead of
  looping. The backplane keeps **no accounts of its own** — users, roles and
  sign-out live in usr. Requires both apps under one parent domain with usr's
  `USR_SSO_COOKIE_DOMAIN` set.
- **`BACKPLANE_API_KEY`** — static bearer key for non-interactive clients
  (MCP, curl, CI webhooks); the UI can also store it in localStorage. This is
  also the break-glass path if usr is unreachable.

Use behind the shared edge (HTTPS) — the SSO cookie is `Secure`-flagged and
the bearer key shouldn't travel over plain LAN HTTP.

### HTTPS (shared edge)

The plain-HTTP listener binds to localhost only; LAN access goes through the
shared edge proxy (switchboard), which terminates TLS and reaches
`backplane:8430` over the external `edge` docker network. Enable it with
`COMPOSE_FILE=docker-compose.yml:docker-compose.edge.yml` in the install
directory's `.env`, then `up -d` (or re-run the installer). Grafana and
Prometheus join the same network and are proxied the same way.

**Self-update** is the known chicken-and-egg: after pulling new backplane code,
re-run `just backplane-up` manually.

## Deploy model

A project registers a git repo + branch, watched image refs, and a `compose`
target (optional compose files/profiles/project name). Deploying:

1. clone or fetch+hard-reset the repo under `$BACKPLANE_WORKDIRS/<name>`
2. `docker compose -p <name> [-f …] [--profile …] pull`
3. `… up -d --remove-orphans`

Git-driven rather than recreate-in-place so compose-file changes deploy too.

**Workdirs are host-visible** ([ADR 0005](../../docs/adr/0005-host-visible-backplane-workdirs.md)):
`$BACKPLANE_WORKDIRS` is a host directory mounted into the backplane at the
identical path. Compose runs inside the container but the daemon resolves bind
sources as host paths, so the mirror is what makes repo-relative bind mounts in
managed compose files (e.g. nazu's `./docker-compose.yml` self-mount) work. It also means a
checkout's per-project `.env` can be edited straight on the host, and a workdir
that pre-exists without `.git` (say, seeded with just such an `.env`) is
adopted in place on first sync rather than cloned over.
**Update** is the lighter sibling: pull + `up -d` against the existing checkout
(no git sync) — rolls containers to the newest pushed images without picking up
repo changes. Runs are serialized per project and recorded (status + full log)
in history.

Updates: the poller compares each watched image's remote manifest digest
(OCI token flow — anonymous unless `BACKPLANE_GITHUB_TOKEN` is set) against the
digests of running containers; projects with `autoDeploy` redeploy
automatically. CI can also push deploys via webhook: `POST
/api/projects/<name>/deploy?trigger=webhook` with the API key.

### Private repos and images

Set `BACKPLANE_GITHUB_TOKEN` (a GitHub PAT with repo read + `read:packages`) to
deploy projects whose git repo and/or GHCR image are private. The token feeds
all three paths: git clone/fetch (via a credential helper scoped to
`github.com`, so it never appears in argv or deploy logs), `docker compose
pull` (a generated docker config under `$BACKPLANE_DATA_DIR/docker-config`),
and the digest poller's ghcr.io token exchange. Unset, everything stays
public-only/anonymous.

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
| `GET /api/auth/status` | auth modes, whether this request authenticates, the usr identity, and the SSO refresh URL for `?return=` (unauthenticated) |
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
the host, all compose projects) and the **switchboard Caddy**'s request metrics
(`switchboard:2020` over the shared `edge` network, best-effort — target is
down on hosts without the edge stack). Grafana OSS
(AGPLv3 — fine self-hosted) is linked out for ad-hoc exploration with the
Prometheus datasource provisioned. Zero egress; everything stays on the box.

## Future

- `aws` deploy-target adapter (ECS/App Runner) behind the same `DeployTarget`
  interface in `src/server/lib/targets/`.
- App-level instrumentation beyond Caddy's request metrics.
- nazu's dashboard sheds its container panel and links here.
