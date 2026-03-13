# nazu — Full Code Context

> **Purpose:** Complete code reference so Claude doesn't have to re-read source files.

> **Status:** Database layer and MCP server fully implemented and smoke-tested. API layer is empty scaffolding.

## Project Structure

```
nazu/
├── CLAUDE.md              # Claude coding instructions
├── CONTEXT.md             # This file — full code reference
├── .env                   # Environment variables (DB creds, API keys)
├── docker-compose.yml     # Service definitions (empty)
├── requirements.txt       # Python dependencies
├── scripts/
│   └── init_db.py         # Database initialization script
└── app/
    ├── __init__.py         # Package root (empty)
    ├── config.py           # Pydantic settings from .env
    ├── api/
    │   ├── __init__.py     # (empty)
    │   └── routes.py       # HTTP API route definitions (empty)
    ├── mcp/
    │   ├── __init__.py     # Package docstring
    │   ├── embeddings.py   # Async OpenAI embedding generation
    │   ├── server.py       # FastMCP entry point + lifespan
    │   └── tools.py        # 7 MCP tool implementations
    └── db/
        ├── __init__.py     # Connection pool: init_pool, get_pool, close_pool
        ├── models.py       # Pydantic models + CRUD operations
        └── schema.py       # SQL DDL statements + apply_schema()
```

## Dependency Graph

```
app/api/routes.py  ──┐
                     ├──→  app/db/models.py  ──→  app/db/__init__.py (pool)
app/mcp/tools.py  ──┤          │                        │
       │            │          ▼                        ▼
       │            └→ app/mcp/embeddings.py       app/config.py
       ▼                  │                             │
app/mcp/server.py         ▼                             ▼
                     OpenAI API              PostgreSQL + pgvector
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
| Database | PostgreSQL + pgvector (on host) |
| DB driver | asyncpg (raw SQL, async) |
| App server | Python (containerized via Docker Compose) |
| MCP server | Python |
| Embeddings | OpenAI `text-embedding-3-small` (1536 dims) |
| AI layer | Claude API (external, client-side) |
| Tunnel | Cloudflare Tunnel |
| Local LLM (future) | Ollama |

## Config — `app/config.py`

Pydantic `BaseSettings` singleton loaded from `.env`:

| Field | Type | Default |
|---|---|---|
| `database_url` | str | `postgresql://nazu:password@localhost:5432/nazu` |
| `db_pool_min_size` | int | 2 |
| `db_pool_max_size` | int | 10 |
| `openai_api_key` | str | `""` |
| `embedding_model` | str | `text-embedding-3-small` |
| `embedding_dimensions` | int | 1536 |

Import: `from app.config import settings`

## Database Layer — `app/db/`

### Schema — `app/db/schema.py`

SQL DDL constants executed by `apply_schema(conn)`:

| Statement | Purpose |
|---|---|
| `ENABLE_PGVECTOR` | `CREATE EXTENSION IF NOT EXISTS vector` |
| `CREATE_ITEMS_TABLE` | Items table with UUID PK, JSONB metadata, vector(1536) |
| `CREATE_TYPE_INDEX` | B-tree on `type` |
| `CREATE_METADATA_GIN_INDEX` | GIN on `metadata` (JSONB containment) |
| `CREATE_EMBEDDING_HNSW_INDEX` | HNSW on `embedding` with `vector_cosine_ops` (m=16, ef_construction=64) |
| `CREATE_CREATED_AT_INDEX` | B-tree DESC on `created_at` |
| `CREATE_UPDATED_AT_FUNCTION` | PL/pgSQL trigger function |
| `CREATE_UPDATED_AT_TRIGGER` | Auto-updates `updated_at` on row update |

### Items Table

```sql
CREATE TABLE items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type        VARCHAR(50) NOT NULL,
    content     TEXT NOT NULL,
    metadata    JSONB NOT NULL DEFAULT '{}',
    embedding   vector(1536),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Metadata Shape (by type)

| Type | Metadata Fields |
|---|---|
| note | `tags[]`, `source`, `topics[]`, `needs_review`, `classification_confidence` |
| task | `tags[]`, `status` (pending/done), `due_date`, `topics[]`, `needs_review`, `classification_confidence` |
| url | `tags[]`, `source_url`, `title`, `topics[]`, `needs_review`, `classification_confidence` |
| transcript | `tags[]`, `source`, `date`, `topics[]`, `needs_review`, `classification_confidence` |

**Semantic classification fields (all types):**
- `topics[]` — semantic domain tags (e.g. `["home-automation", "zigbee"]`). Set at capture time by Claude. Distinct from ad-hoc `tags[]`.
- `needs_review` — `true` when classification confidence was below threshold. Clear by setting to `false` after correcting topics via `update_item`.
- `classification_confidence` — optional float (0–1) stored for auditing; not queried.

### Connection Pool — `app/db/__init__.py`

| Function | Signature | Purpose |
|---|---|---|
| `init_pool()` | `async -> asyncpg.Pool` | Create global pool, register pgvector types |
| `get_pool()` | `-> asyncpg.Pool` | Return pool (raises if not initialized) |
| `close_pool()` | `async -> None` | Close pool and reset |

pgvector types and JSONB codec (text format) registered via `_init_connection` callback on every new connection. `_record_to_item` also defensively calls `json.loads` on metadata if asyncpg returns it as a string.

### Models + CRUD — `app/db/models.py`

**Pydantic Models:**

| Model | Fields | Purpose |
|---|---|---|
| `ItemCreate` | `type`, `content`, `metadata={}` | Input for creation |
| `ItemUpdate` | `content?`, `metadata?` | Partial update input |
| `Item` | `id`, `type`, `content`, `metadata`, `embedding?`, `created_at`, `updated_at` | Full item from DB |
| `SearchResult` | `item: Item`, `distance: float` | Semantic search result |

**CRUD Functions:**

| Function | Signature | SQL |
|---|---|---|
| `create_item` | `(ItemCreate, embedding?) -> Item` | `INSERT ... RETURNING *` |
| `get_item` | `(UUID) -> Item \| None` | `SELECT * WHERE id = $1` |
| `update_item` | `(UUID, ItemUpdate, embedding?) -> Item \| None` | Dynamic `UPDATE ... SET` |
| `delete_item` | `(UUID) -> bool` | `DELETE WHERE id = $1` |
| `list_items` | `(type?, tag?, status?, topic?, needs_review?, limit, offset) -> list[Item]` | Filtered `SELECT` with pagination |
| `search_items` | `(ndarray, limit, type?, tag?, topic?, needs_review?) -> list[SearchResult]` | `embedding <=> $1` cosine distance |

Key details:
- JSONB params passed as `json.dumps()` with `::jsonb` cast
- Tag filtering: `metadata->'tags' ? $N` (JSONB containment, uses GIN index)
- Status filtering: `metadata->>'status' = $N`
- Embeddings accepted as pre-computed `np.ndarray` (generation happens in MCP layer)

## Scripts

### `scripts/init_db.py`
- Run: `python -m scripts.init_db`
- Direct connection (no pool), calls `apply_schema(conn)`
- Verifies table exists and lists indexes
- Catches missing pgvector extension with helpful error message
- Idempotent (all DDL uses `IF NOT EXISTS`)

## MCP Layer — `app/mcp/`

### Embeddings — `app/mcp/embeddings.py`
- Lazy singleton `AsyncOpenAI` client (created on first call)
- `generate_embedding(text: str) -> np.ndarray` — returns float32 array (1536-dim)
- Uses `settings.openai_api_key`, `settings.embedding_model`, `settings.embedding_dimensions`
- Swappable for Ollama later (only this file changes)

### Server — `app/mcp/server.py`
- `app_lifespan(server)` — async context manager: `init_pool()` on startup, `close_pool()` on shutdown
- `mcp = FastMCP("nazu", lifespan=app_lifespan)` — server instance
- Tools registered via `mcp.tool()(tools.fn)` for each of 7 tools
- Run: `python -m app.mcp.server` (stdio transport)

### Tools — `app/mcp/tools.py`

| Tool | Embeds? | CRUD Called | Parameters |
|---|---|---|---|
| `add_item` | Yes | `create_item` | `type`, `content`, `topics`, `classification_confidence?`, `metadata?` |
| `search` | Yes | `search_items` | `query`, `limit?`, `type?`, `tag?`, `topic?`, `needs_review?` |
| `get_item` | No | `get_item` | `id` (str) |
| `list_items` | No | `list_items` | `type?`, `tag?`, `status?`, `topic?`, `needs_review?`, `limit?`, `offset?` |
| `update_item` | If content changes | `update_item` | `id`, `content?`, `metadata?` |
| `delete_item` | No | `delete_item` | `id` (str) |
| `add_task` | Yes (via `add_item`) | `create_item` | `content`, `topics`, `due_date?`, `tags?`, `classification_confidence?` |
| `complete_task` | No | `get_item` → `update_item` | `id` |
| `review_items` | No | `list_items` | `limit?` |

Key details:
- All `id` params are `str` (UUID conversion inside each tool)
- `add_item` / `add_task`: `topics` is required. `needs_review` is auto-set server-side: empty `topics` OR `classification_confidence < 0.7` → `needs_review: True`. Threshold constant: `CONFIDENCE_THRESHOLD = 0.7` in `tools.py`.
- `add_task` sets `metadata.status = "pending"` and delegates to `add_item`
- `complete_task` validates item is type "task", merges existing metadata with `status: "done"`
- `update_item` only re-embeds when content changes (saves API calls)
- Helpers: `_format_item(Item) -> str`, `_format_search_result(SearchResult, rank) -> str`
- All tools return human-readable text strings

## Cross-Cutting Concerns

### Environment Variables (`.env`)
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `OPENAI_API_KEY` | For embedding generation |
| `EMBEDDING_MODEL` | Model name |
| `EMBEDDING_DIMENSIONS` | Vector dimensions (1536) |
| `DB_POOL_MIN_SIZE` | Pool min connections |
| `DB_POOL_MAX_SIZE` | Pool max connections |

### Deferred Decisions
- Item relationship/linking model
- Notion import tooling
- Ollama vs OpenAI for embeddings
- Docker Compose configuration

### Mobile / Voice Integration (Pixel 10)
Goal: voice access via Gemini Live using Gemini CLI Extensions. See `docs/gemini-mobile.md` for full architecture.

| Component | Status | Notes |
|---|---|---|
| Cloudflare Tunnel (public endpoint) | To do |  |
| HTTP/SSE transport entry point | To do | `app/mcp/server_http.py`, port 8001 |
| API key auth middleware | To do | Bearer token on the SSE endpoint; `NAZU_API_KEY` in `.env` |
| `nazu-extension/` directory | To do | `gemini-extension.json` + `GEMINI.md` |
