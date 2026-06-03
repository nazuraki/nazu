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
| Graph DB | FalkorDB (knowledge graph + per-project code intelligence graphs) |
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
2. **OAuth via Auth.js** — Google and GitHub OAuth. When configured (`AUTH_*` env vars), unauthenticated LAN requests are redirected to `/login`.
3. **Local admin login (HTTP Basic)** — set `NAZU_AUTH_USER` and `NAZU_AUTH_PASSWORD` and the LAN prompts for those credentials. Simplest gate — no OAuth apps required.
4. **Open** — if none of the above gate the LAN, requests pass through as a local user (`NAZU_LOCAL_USER_EMAIL`, default `local@nazu.local`).

### Setup

Open mode needs no setup. To gate LAN access, pick **one** of OAuth or local Basic auth (CF Access is orthogonal and gates the tunnel).

**Local admin (Basic auth)** — set `NAZU_AUTH_USER` and `NAZU_AUTH_PASSWORD` in `.env`. Done.

**Generate `AUTH_SECRET`** (required for OAuth session signing):

```sh
openssl rand -hex 32
```

**Google OAuth** — create credentials at [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials → OAuth 2.0 Client. Set redirect URI to `http://localhost:8420/auth/callback/google` (dev) and your public domain (prod).

**GitHub OAuth** — create an app at [github.com/settings/developers](https://github.com/settings/developers). Set callback URL to `http://localhost:8420/auth/callback/github` (dev) and your public domain (prod).

## Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `MINIO_ENDPOINT` | MinIO API endpoint (default: `http://minio:9000`) |
| `MINIO_ACCESS_KEY` | MinIO root user (default: `minioadmin`) |
| `MINIO_SECRET_KEY` | MinIO root password (default: `minioadmin`) |
| `MINIO_BUCKET` | Bucket for documents (default: `nazu-documents`) |
| `ANTHROPIC_API_KEY` | Used to generate excerpts on document ingest (claude-haiku-4-5) |
| `FALKORDB_ADDR` | FalkorDB host:port (Redis protocol) |
| `FALKORDB_GRAPH` | Graph name for the personal knowledge graph |
| `OPENAI_API_KEY` | Used by Graphiti for entity extraction |
| `GITHUB_WEBHOOK_SECRET` | HMAC secret for GitHub push webhook (code graph auto-reindex) |
| `REPO_CACHE_DIR` | Directory for cached git checkouts used by webhook reindexer |
| `GITHUB_TOKEN` | GitHub PAT for dashboard API calls |
| `GITHUB_OWNERS` | Comma-separated GitHub orgs/users to display |
| `DOCKER_CONTAINERS` | Comma-separated container names to show (empty = all) |
| `AUTH_SECRET` | Session signing key — generate with `openssl rand -hex 32` |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | GitHub OAuth app credentials |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth app credentials |
| `NAZU_AUTH_USER` / `NAZU_AUTH_PASSWORD` | Local admin login (HTTP Basic) — set both to gate LAN access without OAuth |
| `NAZU_LOCAL_USER_EMAIL` | Identity stamped on local / Basic-auth requests (default: `local@nazu.local`) |
| `CF_ACCESS_TEAM_DOMAIN` | CF Access team domain, e.g. `yourteam.cloudflareaccess.com` |
| `CF_ACCESS_AUD` | CF Access Application Audience tag (from CF dashboard) |
| `CF_TUNNEL_TOKEN` | Tunnel token from CF dashboard "Install connector" page |
| `NAZU_HOSTNAME` | Hostname Caddy serves on (e.g. `nazu.example.com`) — required with `tls` profile |
| `NAZU_TLS_CERT` | Absolute host path to the TLS cert (e.g. `/etc/ssl/nazu.pem`) — bind-mounted into caddy at the same path; required with `tls` profile |
| `NAZU_TLS_KEY` | Absolute host path to the TLS key — bind-mounted into caddy at the same path; required with `tls` profile |
| `COMPOSE_PROJECT_NAME` | Compose project name (default `nazu`); pinned so the web app's in-container `docker compose` targets the same project/network |

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

## Task runner

```sh
just          # list all available tasks
just up       # start full stack
just down     # stop all services
just build    # build web Docker image
```
