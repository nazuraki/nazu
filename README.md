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

## Remote Access

Served through a Cloudflare Tunnel daemon running on the host. No inbound firewall ports needed. See `infra/cloudflare/tunnel-config.example.yml`.

## Task runner

```sh
just          # list all available tasks
just up       # start full stack
just down     # stop all services
just build    # build web Docker image
```
