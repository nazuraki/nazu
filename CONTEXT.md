# nazu — Full Code Context

> **Purpose:** Complete code reference so Claude doesn't have to re-read source files.

> **Status:** Monorepo structure established. MCP server in `apps/mcp/`. SvelteKit web app scaffolded in `apps/web/` (step 2 done; route migration steps 3–5 pending).

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
│       │   ├── hooks.server.ts # Populates locals.user
│       │   ├── lib/
│       │   │   ├── auth.ts        # Placeholder: getUserFromRequest() → null
│       │   │   ├── priority.ts    # Issue sort scoring (label weight, PR linkage, age)
│       │   │   ├── time.ts        # timeAgo() helper
│       │   │   ├── config/
│       │   │   │   └── services.ts    # Nav service list
│       │   │   ├── dashboard/
│       │   │   │   └── api.ts     # Typed fetch client for /dashboard/api/* endpoints
│       │   │   ├── librarian/
│       │   │   │   ├── types.ts       # Entry, EntryDetail, Tag, SearchResponse interfaces
│       │   │   │   ├── api.ts         # Client fetch wrapper (BASE = /librarian/api)
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
│       │       ├── nazu/+page.svelte      # /nazu
│       │       ├── dashboard/             # /dashboard — repo/Steward/task wall display
│       │       │   ├── +page.svelte           # Full-height grid: Code (3fr) + Stats (1fr)
│       │       │   ├── sections/Code.svelte   # Repo cards panel (polls /dashboard/api/repos)
│       │       │   ├── sections/Stats.svelte  # Steward gauges + nazu tasks
│       │       │   ├── components/RepoCard.svelte
│       │       │   ├── components/Gauge.svelte
│       │       │   ├── components/LineChart.svelte
│       │       │   └── api/               # Server routes (no auth — Cloudflare Tunnel)
│       │       │       ├── repos/+server.ts
│       │       │       ├── repos/activity/+server.ts
│       │       │       ├── repos/compliance/+server.ts
│       │       │       ├── steward/stats/+server.ts   # graceful if steward_runs missing
│       │       │       ├── nazu/projects/+server.ts
│       │       │       └── docker/+server.ts          # Docker Engine socket API, filtered by DOCKER_CONTAINERS env var
│       │       └── librarian/             # /librarian — graph search + document viewer
│       │           ├── +layout.svelte         # Sidebar layout (full-height with nav)
│       │           ├── +page.svelte           # Home: search prompt + tag atlas + recent
│       │           ├── search/+page.svelte    # Search results (paginated)
│       │           ├── entry/[id]/+page.svelte # Entry detail + metadata sidebar
│       │           ├── components/            # TagBadge, ResultCard, Sidebar
│       │           └── api/                   # Server routes (no auth)
│       │               ├── search/+server.ts
│       │               ├── entries/[id]/+server.ts
│       │               ├── tags/+server.ts
│       │               └── recent/+server.ts
│       ├── repos.json         # Per-repo workflow config (statusWorkflow, pagesWorkflow)
│       ├── svelte.config.js   # adapter-node
│       ├── vite.config.ts     # sveltekit() from @sveltejs/kit/vite
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

## Dependency Graph

```
apps/mcp/server/tools.py  ──→  apps/mcp/db/models.py  ──→  apps/mcp/db/__init__.py (pool)
      │                                                             │
      ▼                                                             ▼
apps/mcp/server/graphiti.py                               apps/mcp/config.py
      │                                                             │
      ▼                                                             ▼
FalkorDB (Graphiti)                                    PostgreSQL (tasks, kb_index)

apps/mcp/server/server.py  ──→  apps/mcp/server/tools.py
```

## Architecture

### Hosting Model
- Self-hosted on repurposed Windows machine running Ubuntu Server 24.04 LTS
- Remote access via Cloudflare Tunnel (outbound-only daemon, no inbound ports)
- Cloudflare edge = public HTTPS endpoint, no VPS needed

### Stack
| Layer | Technology |
|---|---|
| OS | Ubuntu Server 24.04 LTS |
| Graph DB | FalkorDB (Docker Compose), accessed via Graphiti |
| Relational DB | PostgreSQL (Docker Compose) |
| DB driver | asyncpg (raw SQL, async) |
| MCP server | Python / FastMCP |
| Knowledge graph | graphiti-core (temporal graph, entity extraction) |
| Entity extraction LLM | OpenAI (used by Graphiti internally) |
| AI layer | Claude API (external, client-side) |
| Tunnel | Cloudflare Tunnel |

### Data Architecture
Two separate concerns:
- **FalkorDB/Graphiti** — unstructured knowledge, temporal graph, semantic search. Full content lives here.
- **PostgreSQL** — structured, well-typed records (tasks, index). Agents query these for fast lookups, then use keywords to fan out to Graphiti for deeper context.
- **`kb_index`** is a curated index, not a mirror of the graph — like an encyclopedia index. Agents explicitly add entries for concepts/people/projects worth surfacing.

## Config — `apps/mcp/config.py`

Pydantic `BaseSettings` singleton loaded from `.env`:

| Field | Type | Default |
|---|---|---|
| `database_url` | str | `postgresql://nazu:nazu@postgres:5432/nazu` |
| `db_pool_min_size` | int | 2 |
| `db_pool_max_size` | int | 10 |
| `falkordb_uri` | str | `bolt://falkordb:7687` |
| `falkordb_user` | str | `""` |
| `falkordb_password` | str | `""` |
| `openai_api_key` | str | `""` |
| `anthropic_api_key` | str | `""` |
| `gemini_api_key` | str | `""` |

## Docker Compose — `docker-compose.yml`

Single service: `falkordb` (image: `falkordb/falkordb:latest`).
- Port 6379: Redis protocol
- Port 7687: Bolt protocol (used by Graphiti via neo4j driver)
- Volume: `falkordb_data:/data`
- Memory capped at 512mb, AOF persistence enabled

## Database Layer — `apps/mcp/db/`

### Schema — `apps/mcp/db/schema.py`

| Statement | Purpose |
|---|---|
| `CREATE_TASKS_TABLE` | Tasks with description, status, due_date |
| `CREATE_KB_INDEX_TABLE` | Curated knowledge index with type + summary |
| `CREATE_TASKS_STATUS_INDEX` | B-tree on `tasks.status` |
| `CREATE_TASKS_CREATED_AT_INDEX` | B-tree DESC on `tasks.created_at` |
| `CREATE_KB_INDEX_TYPE_INDEX` | B-tree on `kb_index.type` |
| `CREATE_UPDATED_AT_FUNCTION` | PL/pgSQL trigger function |
| `CREATE_TASKS_UPDATED_AT_TRIGGER` | Auto-updates `tasks.updated_at` on row update |

### Tasks Table

```sql
CREATE TABLE tasks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    description TEXT NOT NULL,
    status      VARCHAR(20) NOT NULL DEFAULT 'pending',
    due_date    DATE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### KB Index Table

```sql
CREATE TABLE kb_index (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type        VARCHAR(50) NOT NULL,
    summary     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`kb_index.type` is free-form — typical values: `concept`, `person`, `project`, `place`, `event`.

### Connection Pool — `apps/mcp/db/__init__.py`

| Function | Signature | Purpose |
|---|---|---|
| `init_pool()` | `async -> asyncpg.Pool` | Create global pool |
| `get_pool()` | `-> asyncpg.Pool` | Return pool (raises if not initialized) |
| `close_pool()` | `async -> None` | Close pool and reset |

### Models + CRUD — `apps/mcp/db/models.py`

**Task models:**

| Model | Fields |
|---|---|
| `TaskCreate` | `description`, `due_date?` |
| `TaskUpdate` | `description?`, `status?`, `due_date?` |
| `Task` | `id`, `description`, `status`, `due_date?`, `created_at`, `updated_at` |

**KbEntry models:**

| Model | Fields |
|---|---|
| `KbEntryCreate` | `type`, `summary` |
| `KbEntry` | `id`, `type`, `summary`, `created_at` |

**CRUD functions:**

| Function | Signature |
|---|---|
| `create_task` | `(TaskCreate) -> Task` |
| `get_task` | `(UUID) -> Task \| None` |
| `update_task` | `(UUID, TaskUpdate) -> Task \| None` |
| `delete_task` | `(UUID) -> bool` |
| `list_tasks` | `(status?, limit, offset) -> list[Task]` |
| `create_kb_entry` | `(KbEntryCreate) -> KbEntry` |
| `delete_kb_entry` | `(UUID) -> bool` |
| `list_kb_entries` | `(type?, limit, offset) -> list[KbEntry]` |

## Graphiti Layer — `apps/mcp/server/graphiti.py`

Thin singleton wrapper around `graphiti_core.Graphiti`.

| Function | Purpose |
|---|---|
| `init_graphiti()` | Connect to FalkorDB, call `build_indices_and_constraints()` |
| `get_graphiti()` | Return singleton (raises if not initialized) |
| `close_graphiti()` | Close driver and reset |

Graphiti uses OpenAI internally for entity/relation extraction when episodes are added.

## MCP Layer — `apps/mcp/server/`

### Server — `apps/mcp/server/server.py`
- `app_lifespan`: `init_pool()` + `init_graphiti()` on startup; `close_graphiti()` + `close_pool()` on shutdown.
- Run: `python -m server.server` (from `apps/mcp/`, stdio transport)

### Tools — `apps/mcp/server/tools.py`

**Task tools:**

| Tool | CRUD Called | Parameters |
|---|---|---|
| `add_task` | `create_task` | `description`, `due_date?` |
| `complete_task` | `update_task` | `id` |
| `list_tasks` | `list_tasks` | `status?` |
| `delete_task` | `delete_task` | `id` |

**Knowledge graph tools:**

| Tool | Graphiti Call | Parameters |
|---|---|---|
| `remember` | `add_episode` | `content`, `source_description`, `name?` |
| `recall` | `search` | `query`, `limit?` |

**KB index tools:**

| Tool | CRUD Called | Parameters |
|---|---|---|
| `add_index_entry` | `create_kb_entry` | `type`, `summary` |
| `list_index` | `list_kb_entries` | `type?` |
| `delete_index_entry` | `delete_kb_entry` | `id` |

All tools return human-readable text strings.

## Infra — `infra/`

### `infra/postgres/init.sql`
Plain SQL DDL run on first container boot (mounted at `/docker-entrypoint-initdb.d/`). Idempotent (`IF NOT EXISTS`). Creates `tasks`, `kb_index`, indexes, and `updated_at` trigger.

## Cross-Cutting Concerns

### Environment Variables (`.env`)
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `FALKORDB_URI` | FalkorDB bolt URI (default: `bolt://localhost:7687`) |
| `FALKORDB_USER` | FalkorDB user (default: empty) |
| `FALKORDB_PASSWORD` | FalkorDB password (default: empty) |
| `OPENAI_API_KEY` | Used by Graphiti for entity extraction |
| `ANTHROPIC_API_KEY` | Optional |
| `GEMINI_API_KEY` | Optional |
| `DOCKER_CONTAINERS` | Comma-separated container names to show in dashboard (empty = show all) |

### Deferred Decisions
- `apps/graphiti-api/` — separate Python/FastAPI service wrapping Graphiti (currently called directly from MCP server)
- Cloudflare Tunnel setup
- HTTP/SSE transport entry point for MCP
- API key auth middleware
- Gemini CLI Extension (`nazu-extension/`)
- Notion import tooling

### Mobile / Voice Integration (Pixel 10)
Goal: voice access via Gemini Live using Gemini CLI Extensions. See `docs/gemini-mobile.md` for full architecture.

| Component | Status | Notes |
|---|---|---|
| Cloudflare Tunnel (public endpoint) | To do |  |
| HTTP/SSE transport entry point | To do | `apps/mcp/server/server_http.py`, port 8001 |
| API key auth middleware | To do | Bearer token on the SSE endpoint; `NAZU_API_KEY` in `.env` |
| `nazu-extension/` directory | To do | `gemini-extension.json` + `GEMINI.md` |

### Monorepo Migration (GH Issue #1)
| Step | Status |
|---|---|
| 1. Restructure + pnpm workspaces | Done |
| 2. Scaffold `apps/web` + wire compose | Done |
| 3. Migrate butterfly → `/` | To do |
| 4. Migrate sysctl → `/dashboard` | Done |
| 5. Migrate librarian → `/librarian` | Done |
| 6. Build `/nazu` UI | To do |
| 7. PWA manifest + service worker | To do |
