# nazu — Full Code Context

> **Purpose:** Complete code reference so Claude doesn't have to re-read source files.

## Project Structure

```
nazu/
├── CLAUDE.md              # Claude coding instructions
├── CONTEXT.md             # This file — full code reference
├── Justfile               # Repo-wide task runner
├── package.json           # pnpm workspace root (pnpm.onlyBuiltDependencies: esbuild)
├── pnpm-workspace.yaml    # Workspace config (apps/*, packages/*)
├── docker-compose.yml     # web + postgres + falkordb services
├── .env                   # Environment variables (DB creds, API keys)
├── apps/
│   ├── mcp/               # Python MCP server
│   └── web/               # SvelteKit app (Svelte 5, adapter-node, port 3000)
│       ├── src/
│       │   ├── app.html
│       │   ├── app.d.ts       # App.Locals: user (from $lib/auth)
│       │   ├── app.css        # Global styles, imports @nazu/ui/tokens.css
│       │   ├── auth.ts            # SvelteKitAuth config (Google + GitHub providers)
│       │   ├── hooks.server.ts    # sequence(authHandle, authFlow): CF JWT → OAuth session → /login redirect
│       │   ├── lib/
│       │   │   ├── auth.ts        # User interface + validateCFToken() (jose, CF_ACCESS_TEAM_DOMAIN/AUD)
│       │   │   ├── priority.ts    # Issue sort scoring (label weight, PR linkage, age)
│       │   │   ├── time.ts        # timeAgo() helper
│       │   │   ├── config/
│       │   │   │   └── services.ts    # Nav service list
│       │   │   ├── dashboard/
│       │   │   │   └── api.ts     # Typed fetch client for /api/* dashboard endpoints
│       │   │   ├── librarian/
│       │   │   │   ├── types.ts       # Entry, EntryDetail, Tag, SearchResponse interfaces
│       │   │   │   ├── api.ts         # Client fetch wrapper (BASE = /api)
│       │   │   │   └── stores.ts      # searchCache, entryCache (svelte/store writable)
│       │   │   └── server/
│       │   │       ├── db.ts          # postgres singleton (DATABASE_URL)
│       │   │       ├── falkordb.ts    # FalkorDB client via ioredis (FALKORDB_ADDR, FALKORDB_GRAPH)
│       │   │       ├── repoconfig.ts  # repos.json loader (getStatusWorkflow, getPagesWorkflow)
│       │   │       └── github/
│       │   │           ├── client.ts  # GitHubClient (multi-owner PAT, paginate)
│       │   │           ├── types.ts   # Repo, Issue, PR, WorkflowRun interfaces
│       │   │           ├── queries.ts # fetchUserRepos, fetchOpenIssues, fetchRecentRuns, etc.
│       │   │           └── index.ts   # Singleton github client + owners from env
│       │   └── routes/
│       │       ├── +layout.svelte         # Shell: header nav + content area
│       │       ├── (home)/+page.svelte    # / — home dashboard
│       │       ├── login/                 # /login — OAuth sign-in page (GitHub + Google)
│       │       ├── api/                   # Consolidated server routes (protected by hooks.server.ts auth)
│       │       │   ├── repos/+server.ts
│       │       │   ├── repos/activity/+server.ts
│       │       │   ├── repos/compliance/+server.ts
│       │       │   ├── steward/stats/+server.ts       # graceful if steward_runs missing
│       │       │   ├── nazu/projects/+server.ts
│       │       │   ├── docker/+server.ts              # Docker Engine socket API, filtered by DOCKER_CONTAINERS env var
│       │       │   ├── containers/[id]/logs/+server.ts
│       │       │   ├── search/+server.ts              # Librarian search
│       │       │   ├── entries/[id]/+server.ts
│       │       │   ├── tags/+server.ts
│       │       │   └── recent/+server.ts
│       │       ├── dashboard/             # /dashboard — repo/Steward/task wall display
│       │       │   ├── +page.svelte           # Full-height grid: Code (3fr) + Stats (1fr)
│       │       │   ├── sections/Code.svelte   # Repo cards panel (polls /api/repos)
│       │       │   ├── sections/Stats.svelte  # Steward gauges + nazu tasks
│       │       │   ├── components/RepoCard.svelte
│       │       │   ├── components/Gauge.svelte
│       │       │   └── components/LineChart.svelte
│       │       └── librarian/             # /librarian — graph search + document viewer
│       │           ├── +layout.svelte         # Sidebar layout (full-height with nav)
│       │           ├── +page.svelte           # Home: search prompt + tag atlas + recent
│       │           ├── search/+page.svelte    # Search results (paginated)
│       │           ├── entry/[id]/+page.svelte # Entry detail + metadata sidebar
│       │           └── components/            # TagBadge, ResultCard, Sidebar
│       ├── repos.json         # Per-repo workflow config (statusWorkflow, pagesWorkflow)
│       ├── static/
│       │   └── icons/         # PWA icons (192x192, 512x512, apple-touch-icon) — drop PNGs here
│       ├── svelte.config.js   # adapter-node
│       ├── vite.config.ts     # sveltekit() + @vite-pwa/sveltekit (Workbox, manifest, autoUpdate)
│       ├── tsconfig.json
│       └── Dockerfile         # Multi-stage Node 22; build context = repo root
├── packages/
│   └── ui/                # Shared design tokens (@nazu/ui)
│       └── src/tokens.css # CSS custom properties (brand palette + scale)
│       ├── config.py      # Pydantic settings from .env
│       ├── db/
│       │   ├── __init__.py    # Connection pool: init_pool, get_pool, close_pool
│       │   ├── models.py      # Pydantic models + CRUD (tasks, kb_index)
│       │   └── schema.py      # SQL DDL statements + apply_schema()
│       ├── server/
│       │   ├── __init__.py    # Package docstring
│       │   ├── graphiti.py    # Graphiti singleton: init, get, close
│       │   ├── server.py      # FastMCP entry point + lifespan
│       │   └── tools.py       # 9 MCP tool implementations
│       ├── requirements.txt
│       ├── requirements-dev.txt
│       └── Dockerfile
├── infra/
│   ├── postgres/
│   │   └── init.sql       # DDL — mounted into postgres container on first boot
│   └── cloudflare/
│       └── tunnel-config.example.yml  # Copy to ~/.cloudflared/config.yml on host
└── docs/
    ├── PURPOSE.md
    ├── gemini-mobile.md
    └── nazu-claude-integration.md
```

## Architecture

### Hosting Model
- Self-hosted on Ubuntu Server 24.04 LTS
- Remote access via Cloudflare Tunnel (outbound-only daemon, no inbound ports)
- Cloudflare edge = public HTTPS endpoint, no VPS needed

### Stack
| Layer | Technology |
|---|---|
| OS | Ubuntu Server 24.04 LTS |
| Web app | SvelteKit 5 (adapter-node, port 3000) |
| Graph DB | FalkorDB (Docker Compose), accessed via Graphiti |
| Relational DB | PostgreSQL (Docker Compose) |
| Knowledge graph | graphiti-core (temporal graph, entity extraction) |
| Entity extraction LLM | OpenAI (used by Graphiti internally) |
| Tunnel | Cloudflare Tunnel |

### Data Architecture
Two separate storage concerns:
- **FalkorDB/Graphiti** — unstructured knowledge, temporal graph, semantic search. Full content lives here.
- **PostgreSQL** — structured records (kb_index). Fast lookups without graph traversal.
- **`kb_index`** is a curated index, not a mirror of the graph — like an encyclopedia index.

## Docker Compose — `docker-compose.yml`

Three services:

| Service | Image | Ports (host:container) |
|---|---|---|
| `cloudflared` | cloudflare/cloudflared:latest | none (outbound only) |
| `web` | built from `apps/web/Dockerfile` | 3000:3000 |
| `postgres` | postgres:16 | 5433:5432 |
| `falkordb` | falkordb/falkordb:latest | 6380:6379, 7688:7687 |

Non-default host ports (`5433`, `6380`, `7688`) avoid conflicts with any local instances.

## Web Server Layer — `apps/web/src/lib/server/`

| File | Purpose |
|---|---|
| `db.ts` | postgres singleton (DATABASE_URL) |
| `falkordb.ts` | FalkorDB client via ioredis (FALKORDB_ADDR, FALKORDB_GRAPH) |
| `repoconfig.ts` | repos.json loader (getStatusWorkflow, getPagesWorkflow) |
| `github/client.ts` | GitHubClient (multi-owner PAT, paginate) |
| `github/queries.ts` | fetchUserRepos, fetchOpenIssues, fetchRecentRuns, etc. |

## API Routes — `apps/web/src/routes/api/`

No auth — protected by Cloudflare Tunnel access control.

| Route | Purpose |
|---|---|
| `repos/` | Repo list with issue/PR counts |
| `repos/activity/` | Recent commit activity |
| `repos/compliance/` | Branch protection / CI compliance |
| `steward/stats/` | Steward run history gauges |
| `nazu/projects/` | nazu project records |
| `docker/` | Docker Engine socket API, filtered by DOCKER_CONTAINERS |
| `containers/[id]/logs/` | Container log streaming |
| `search/` | Librarian full-text search |
| `entries/[id]/` | Librarian entry detail |
| `tags/` | Tag list |
| `recent/` | Recently added entries |

## Infra — `infra/`

- `infra/postgres/migrations/NNN_*.sql` — numbered, forward-only migrations. Applied at web app startup by `apps/web/src/lib/server/migrate.ts` (tracked in `schema_migrations` table, each file runs in its own transaction). To add a migration, create the next-numbered file. The web container has `MIGRATIONS_DIR=/app/migrations` baked in via the Dockerfile.
- `infra/cloudflare/tunnel-config.example.yml` — copy to `~/.cloudflared/config.yml` on host.

## Environment Variables (`.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `FALKORDB_ADDR` | FalkorDB host:port (Redis protocol) |
| `FALKORDB_GRAPH` | Graph name |
| `OPENAI_API_KEY` | Used by Graphiti for entity extraction |
| `GITHUB_TOKEN` | GitHub PAT for dashboard API calls |
| `GITHUB_OWNERS` | Comma-separated GitHub orgs/users to display |
| `DOCKER_CONTAINERS` | Comma-separated container names to show (empty = all) |
| `AUTH_SECRET` | Session signing key — `openssl rand -hex 32` |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | GitHub OAuth app credentials |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth app credentials |
| `CF_ACCESS_TEAM_DOMAIN` | CF Access team domain, e.g. `yourteam.cloudflareaccess.com` |
| `CF_ACCESS_AUD` | CF Access Application Audience tag (from CF dashboard) |
| `CF_TUNNEL_TOKEN` | Tunnel token from CF dashboard "Install connector" page |
