# nazu

Personal knowledge management and home dashboard — self-hosted, Cloudflare Tunnel exposed.

## What it is

nazu is a personal second-brain and home control panel. It consists of:

- **Dashboard** — live view of GitHub repos, open issues/PRs, CI status, and running Docker containers
- **Librarian** — knowledge base: full-text search, tag browser, and entry viewer backed by PostgreSQL and FalkorDB

## Stack

| Layer | Technology |
|---|---|
| Web app | SvelteKit 5 (adapter-node, port 3000) |
| Database | PostgreSQL 16 |
| Graph DB | FalkorDB (via Graphiti for temporal graph) |
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

This starts `web`, `postgres`, and `falkordb`. The app is available at `http://localhost:3000`.

### Development

```sh
just web-install   # install pnpm workspace deps
just up-deps       # start postgres + falkordb only
just web-dev       # run SvelteKit dev server (hot reload)
```

### Tests

```sh
just test-functional   # spin up isolated stack, run vitest suite, tear down
```

## Authentication

Auth runs in two layers:

1. **Cloudflare Access** (production) — CF Access sits in front of the tunnel and authenticates at the edge. The app validates the `Cf-Access-Jwt-Assertion` JWT for defense-in-depth.
2. **OAuth via Auth.js** (local dev fallback) — Google and GitHub OAuth when no CF token is present. Requires `AUTH_*` env vars.

### Setup

**Generate `AUTH_SECRET`** (required for OAuth session signing):

```sh
openssl rand -hex 32
```

**Google OAuth** — create credentials at [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials → OAuth 2.0 Client. Set redirect URI to `http://localhost:3000/auth/callback/google` (dev) and your public domain (prod).

**GitHub OAuth** — create an app at [github.com/settings/developers](https://github.com/settings/developers). Set callback URL to `http://localhost:3000/auth/callback/github` (dev) and your public domain (prod).

## Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `FALKORDB_URI` | FalkorDB bolt URI |
| `FALKORDB_USER` / `FALKORDB_PASSWORD` | FalkorDB credentials |
| `OPENAI_API_KEY` | Used by Graphiti for entity extraction |
| `GITHUB_TOKEN` | GitHub PAT for dashboard API calls |
| `GITHUB_OWNERS` | Comma-separated GitHub orgs/users to display |
| `DOCKER_CONTAINERS` | Comma-separated container names to show (empty = all) |
| `AUTH_SECRET` | Session signing key — generate with `openssl rand -hex 32` |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | GitHub OAuth app credentials |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth app credentials |
| `CF_ACCESS_TEAM_DOMAIN` | CF Access team domain, e.g. `yourteam.cloudflareaccess.com` |
| `CF_ACCESS_AUD` | CF Access Application Audience tag (from CF dashboard) |
| `CF_TUNNEL_TOKEN` | Tunnel token from CF dashboard "Install connector" page |

## Remote Access

The `cloudflared` service in Docker Compose connects outbound to the CF edge — no inbound firewall ports needed.

**One-time CF dashboard setup:** in Zero Trust → Networks → Tunnels → your tunnel → Public Hostnames, set the origin to `http://web:3000` (Docker service name). See `infra/cloudflare/tunnel-config.example.yml` for details.

## Task runner

```sh
just          # list all available tasks
just up       # start full stack
just down     # stop all services
just build    # build web Docker image
```
