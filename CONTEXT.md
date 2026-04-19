# nazu — Full Code Context

> **Purpose:** Complete code reference so Claude doesn't have to re-read source files.

> **Status:** DB layer, MCP server, and Graphiti integration fully implemented. API layer is empty scaffolding.

## Project Structure

```
nazu/
├── CLAUDE.md              # Claude coding instructions
├── CONTEXT.md             # This file — full code reference
├── .env                   # Environment variables (DB creds, API keys)
├── docker-compose.yml     # FalkorDB service
├── requirements.txt       # Python dependencies
├── scripts/
│   └── init_db.py         # Database initialization script (Postgres only)
└── app/
    ├── __init__.py         # Package root (empty)
    ├── config.py           # Pydantic settings from .env
    ├── api/
    │   ├── __init__.py     # (empty)
    │   └── routes.py       # HTTP API route definitions (empty)
    ├── mcp/
    │   ├── __init__.py     # Package docstring
    │   ├── graphiti.py     # Graphiti singleton: init, get, close
    │   ├── server.py       # FastMCP entry point + lifespan
    │   └── tools.py        # 9 MCP tool implementations
    └── db/
        ├── __init__.py     # Connection pool: init_pool, get_pool, close_pool
        ├── models.py       # Pydantic models + CRUD (tasks, kb_index)
        └── schema.py       # SQL DDL statements + apply_schema()
```

## Dependency Graph

```
app/mcp/tools.py  ──→  app/db/models.py  ──→  app/db/__init__.py (pool)
      │                                              │
      ▼                                              ▼
app/mcp/graphiti.py                           app/config.py
      │                                              │
      ▼                                              ▼
FalkorDB (Graphiti)                        PostgreSQL (tasks, kb_index)

app/mcp/server.py  ──→  app/mcp/tools.py
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
| Relational DB | PostgreSQL (on host, not containerized) |
| DB driver | asyncpg (raw SQL, async) |
| App server | Python (containerized via Docker Compose) |
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

## Config — `app/config.py`

Pydantic `BaseSettings` singleton loaded from `.env`:

| Field | Type | Default |
|---|---|---|
| `database_url` | str | `postgresql://nazu:password@localhost:5432/nazu` |
| `db_pool_min_size` | int | 2 |
| `db_pool_max_size` | int | 10 |
| `falkordb_uri` | str | `bolt://localhost:7687` |
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

## Database Layer — `app/db/`

### Schema — `app/db/schema.py`

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

### Connection Pool — `app/db/__init__.py`

| Function | Signature | Purpose |
|---|---|---|
| `init_pool()` | `async -> asyncpg.Pool` | Create global pool |
| `get_pool()` | `-> asyncpg.Pool` | Return pool (raises if not initialized) |
| `close_pool()` | `async -> None` | Close pool and reset |

No custom connection init needed (no pgvector, no JSONB columns).

### Models + CRUD — `app/db/models.py`

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

## Graphiti Layer — `app/mcp/graphiti.py`

Thin singleton wrapper around `graphiti_core.Graphiti`.

| Function | Purpose |
|---|---|
| `init_graphiti()` | Connect to FalkorDB, call `build_indices_and_constraints()` |
| `get_graphiti()` | Return singleton (raises if not initialized) |
| `close_graphiti()` | Close driver and reset |

Graphiti uses OpenAI internally for entity/relation extraction when episodes are added.

## MCP Layer — `app/mcp/`

### Server — `app/mcp/server.py`
- `app_lifespan`: `init_pool()` + `init_graphiti()` on startup; `close_graphiti()` + `close_pool()` on shutdown.
- Run: `python -m app.mcp.server` (stdio transport)

### Tools — `app/mcp/tools.py`

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

## Scripts

### `scripts/init_db.py`
- Run: `python -m scripts.init_db`
- Direct connection (no pool), calls `apply_schema(conn)`
- Verifies both tables exist and lists their indexes
- Idempotent (all DDL uses `IF NOT EXISTS`)

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

### Deferred Decisions
- Docker Compose app service definition
- Cloudflare Tunnel setup
- HTTP/SSE transport entry point (`app/mcp/server_http.py`)
- API key auth middleware
- Gemini CLI Extension (`nazu-extension/`)
- Notion import tooling

### Mobile / Voice Integration (Pixel 10)
Goal: voice access via Gemini Live using Gemini CLI Extensions. See `docs/gemini-mobile.md` for full architecture.

| Component | Status | Notes |
|---|---|---|
| Cloudflare Tunnel (public endpoint) | To do |  |
| HTTP/SSE transport entry point | To do | `app/mcp/server_http.py`, port 8001 |
| API key auth middleware | To do | Bearer token on the SSE endpoint; `NAZU_API_KEY` in `.env` |
| `nazu-extension/` directory | To do | `gemini-extension.json` + `GEMINI.md` |
