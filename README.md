# nazu

Personal knowledge management and home dashboard — self-hosted, Cloudflare Tunnel exposed.

## What it is

nazu is a personal second-brain and home control panel. It consists of:

- **Dashboard** — live view of GitHub repos, open issues/PRs, CI status, and running Docker containers
- **Tasks** — personal task list with subtasks, status tracking, and due dates
- **Search** — knowledge base: full-text search, tag browser, and entry viewer backed by PostgreSQL + MinIO
- **Ingest** — paste markdown or plain text to add documents to the knowledge base; excerpts generated automatically via Claude
- **Code graph** — indexes codebases into per-project FalkorDB graphs using real language tooling (ts-morph, jedi, syn, go/ast); queryable via MCP tools or REST API

## Stack

| Layer | Technology |
|---|---|
| Web app | SvelteKit 5 (adapter-node; host port 8420 → container 3000) |
| Database | PostgreSQL 16 |
| Object storage | MinIO (S3-compatible, documents + attachments) |
| Graph DB | FalkorDB — per-project code-intelligence graphs (`code:*`); a personal knowledge graph is planned, not yet built |
| Tunnel | Cloudflare Tunnel (outbound-only, no open ports) |
| Runtime | Docker Compose |

## Running

### Prerequisites

- Docker + Docker Compose
- A `.env` file (copy `.env.example` and fill in values)

### Start

```sh
just up
```

This starts the **core stack** — `web`, `postgres`, `minio`, and `falkordb`. The app is available at `http://localhost:8420`.

#### Optional services (Compose profiles)

The two ingress services are gated behind Compose profiles so you only run what you need. They can be toggled at runtime from **Settings** in the web UI (the app shells out to `docker compose` over the mounted Docker socket), or enabled at startup with `--profile <name>`:

| Profile | Services | Needed for |
|---|---|---|
| `tls` | `caddy` | HTTPS termination on `:443` (requires `NAZU_HOSTNAME`, `NAZU_TLS_CERT`, `NAZU_TLS_KEY`) |
| `tunnel` | `cloudflared` | Public access via Cloudflare Tunnel (requires `CF_TUNNEL_TOKEN`) |

All services declare `restart: unless-stopped`, so once enabled they survive reboots until explicitly disabled. Enabling `tls` makes the web app write the generated `Caddyfile` into a named volume (`caddy_config`) shared with the caddy container — no host path required.

Examples:

```sh
docker compose up -d                              # core stack
docker compose --profile tls --profile tunnel up -d   # add HTTPS + tunnel
```

### Development

```sh
just web-install   # install pnpm workspace deps
just up-deps       # start postgres + minio + falkordb only
just web-dev       # run SvelteKit dev server (hot reload)
```

### Tests

```sh
just test-functional   # spin up isolated stack, run vitest suite, tear down
```

## Authentication

nazu is **open by default** (zero-conf) — on a fresh install anyone who can reach the port is treated as a local user, with no login. Layer on security as you need it. The app resolves identity in this order:

1. **Cloudflare Access** — CF Access sits in front of the tunnel and authenticates remote traffic at the edge; the app validates the `Cf-Access-Jwt-Assertion` JWT. CF Access only gates the tunnel — it never blocks LAN access on its own.
2. **OAuth via Auth.js** — Google and GitHub OAuth. When configured (in **Settings → Auth**), unauthenticated LAN requests are redirected to `/login`.
3. **Local admin login (HTTP Basic)** — set a local admin username + password in **Settings → Auth** and the LAN prompts for those credentials. Simplest gate — no OAuth apps required.
4. **Open** — if none of the above gate the LAN, requests pass through as a local user (`NAZU_LOCAL_USER_EMAIL`, default `local@nazu.local`).

### Setup

All auth is configured in the in-app **Settings** UI and stored in the database (`app_settings`) — **not** in `.env`. Changes apply on the next request, no restart. Open mode needs no setup. To gate LAN access, pick **one** of OAuth or local admin login (CF Access is orthogonal and gates the tunnel).

- **Local admin (HTTP Basic)** — set a username + password under Settings → Auth.
- **OAuth (Google / GitHub)** — create an OAuth app with the provider, then paste the client ID/secret under Settings → Auth (the session signing secret is generated automatically). Use callback URL `http://localhost:8420/auth/callback/{google,github}` for dev, and your public domain for prod. Create apps at [console.cloud.google.com](https://console.cloud.google.com) (Google) and [github.com/settings/developers](https://github.com/settings/developers) (GitHub).
- **Cloudflare Access** — set your CF Access team domain + application audience (AUD) under Settings → Auth to validate edge JWTs on the tunnel.

## Environment Variables

nazu is **zero-conf**: a fresh `docker compose up` runs with no `.env`. Almost all application config — GitHub integration, OAuth / Cloudflare Access, the Anthropic key (excerpt generation), dashboard containers, feature toggles — is set in the in-app **Settings** UI and stored in the database (`app_settings`), **not** in env. The variables below are the host-coupled values that genuinely can't live in the DB.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string. Defaults to the bundled compose `postgres` service (`postgres://nazu:nazu@postgres:5432/nazu`) — **the canonical DB**. Don't point it at a host Postgres. |
| `MINIO_ENDPOINT` | MinIO API endpoint (default `http://minio:9000`) |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | MinIO root credentials (default `minioadmin`) |
| `MINIO_BUCKET` | Bucket for documents (default `nazu-documents`) |
| `FALKORDB_ADDR` | FalkorDB host:port for the code-graph (default `falkordb:6379`) |
| `FALKORDB_GRAPH` | Default FalkorDB graph name (code-graph queries pass `code:<project>`) |
| `REPO_CACHE_DIR` | Directory for cached git checkouts used by the code-graph webhook reindexer |
| `NAZU_API_KEY` | Static API key(s) for non-interactive agents / the Memory MCP (comma-separated; `Authorization: Bearer` or `X-API-Key`). Off when unset. |
| `NAZU_LOCAL_USER_EMAIL` | Identity stamped on local / open-mode requests (default `local@nazu.local`) |
| `CF_TUNNEL_TOKEN` | Cloudflare Tunnel token (also settable in Settings; required with the `tunnel` profile) |
| `NAZU_HOSTNAME` | Hostname Caddy serves on (e.g. `nazu.example.com`) — required with the `tls` profile |
| `NAZU_TLS_CERT` / `NAZU_TLS_KEY` | Absolute host paths to the TLS cert/key, bind-mounted into caddy at the same path — required with the `tls` profile |
| `COMPOSE_PROJECT_NAME` | Compose project name (default `nazu`); pins the web app's in-container `docker compose` to the same project/network |

## Container images

CI publishes multi-arch (`linux/amd64` + `linux/arm64`) images for the server-deployable apps to GHCR on every push to `main` and on `v*` release tags ([`publish-images.yml`](.github/workflows/publish-images.yml)):

| Image | Source |
|---|---|
| `ghcr.io/nazuraki/nazu-web` | `apps/web` — the SvelteKit app (UI + REST API) |
| `ghcr.io/nazuraki/nazu-discord` | `apps/discord` — Discord ingest sidecar |
| `ghcr.io/nazuraki/nazu-graphiti` | `apps/graphiti` — Graphiti temporal-recall sidecar |
| `ghcr.io/nazuraki/nazu-backplane` | `apps/backplane` — deploy backplane |

Tags: `latest` (tip of `main`), `sha-<short>` (every build, immutable), and `X.Y.Z` / `X.Y` semver tags on releases.

```sh
docker pull ghcr.io/nazuraki/nazu-web:latest
```

`apps/mcp` (stdio, runs client-side) and `apps/indexer` (host CLI tooling) are not server-deployable and have no images.

The compose files declare both `image:` (these GHCR images) and `build:`. Plain `docker compose up` therefore pulls the published image; pass `--build` (`just reup`, `just backplane-up`) to build from source for local dev. The packages must be **public** on GHCR — both anonymous `docker pull` and the backplane's digest poller depend on it.

### Deploying (dev server)

The server runs entirely from published images — no source checkouts:

- **nazu stack** — deployed by the backplane, which keeps its own git workdir purely for the compose files and runs `docker compose pull && up -d`. Alternatively, `just update` does the same by hand.
- **backplane stack** — self-update is manual by design: `just backplane-update` (pull + `up -d`).

A former build checkout on the server can be deleted once both stacks are cut over.

## Remote Access

The `cloudflared` service in Docker Compose connects outbound to the CF edge — no inbound firewall ports needed.

**One-time CF dashboard setup:** in Zero Trust → Networks → Tunnels → your tunnel → Public Hostnames, set the origin to `http://web:3000` (Docker service name). See `infra/cloudflare/tunnel-config.example.yml` for details.

## Code graph indexer

Indexes codebases into per-project FalkorDB graphs for use with Claude Code. See [`apps/indexer/README.md`](apps/indexer/README.md) for full setup instructions.

```sh
just build-indexer          # build TypeScript + Rust binary + Go binary
just index nazu             # index the nazu codebase
just index wealth           # index the wealth codebase
just index-path <dir> <graph>  # index any project
```

Claude Code connects to the MCP server for code intelligence queries — configure in `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "code-graph": {
      "command": "node",
      "args": ["/path/to/nazu/apps/indexer/dist/mcp.js"]
    }
  }
}
```

## Memory MCP

`apps/mcp` is a thin stdio MCP server that gives an AI agent (Claude Code, etc.) a durable **remember / recall** loop over the knowledge base — `remember` → `POST /api/remember`, `recall` → `GET /api/search`. It talks to nazu over REST (set `NAZU_URL` and a matching `NAZU_API_KEY`), so it works against a nazu running anywhere reachable. See [`apps/mcp/README.md`](apps/mcp/README.md) for build + Claude Code registration.

## Task runner

```sh
just          # list all available tasks
just up       # start full stack
just down     # stop all services
just build    # build web Docker image
```
