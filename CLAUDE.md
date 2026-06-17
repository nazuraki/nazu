# nazu — Claude Instructions

## Code intelligence

This project is indexed in nazu's code graph as `code:nazu`.

At the start of every session, call `get_project_overview("nazu")` via the
`code-graph` MCP server to orient yourself. Use `find_symbol`, `find_callers`,
and `query_code_graph` for targeted lookups — do not read source files to answer
structural questions.

Example queries:
- "What functions exist in the auth module?" → find_symbol("nazu", "auth")
- "Who calls saveUser?" → find_callers("nazu", "saveUser")
- "What services does this project use?" → get_project_overview("nazu")

## Project Overview

Personal knowledge management system and home dashboard. The product is a single
**SvelteKit (TypeScript) app** in `apps/web/` that serves both the UI and a REST
API. Data lives in **PostgreSQL** (structured records + full-text search) and
**MinIO** (documents/attachments). Everything runs via Docker Compose.

Repo layout:

| Path | What it is |
|---|---|
| `apps/web/` | SvelteKit 5 app — UI, REST API, all business logic. The product. |
| `apps/mcp/` | **Memory MCP** — a thin TypeScript stdio server that wraps the REST API (`recall`→`GET /api/search`, `remember`→`POST /api/remember`). No DB access of its own. |
| `apps/indexer/` | Code-graph indexer (TS + Rust + Go binaries) + the `code-graph` MCP. Builds per-project graphs in FalkorDB. |
| `infra/` | DB migrations, Caddy/Cloudflare config, git hooks. |

> **Aspirational, not built:** a temporal knowledge graph (Graphiti over FalkorDB)
> for semantic recall is part of the long-term vision (see `docs/PURPOSE.md` and
> the roadmap), but **no Graphiti code exists today**. FalkorDB is currently used
> *only* by the code-graph indexer (`code:*` graphs), not for personal knowledge.
> Treat any "temporal knowledge graph" framing as forward-looking.

## Coding Conventions

| Area | Convention |
|---|---|
| Language | TypeScript everywhere (`apps/web/`, `apps/mcp/`). `apps/indexer/` also ships Rust + Go parser binaries. |
| File naming | `kebab-case.ts` |
| Server code | `apps/web/src/lib/server/` (DB, auth, settings, search), `apps/web/src/routes/` (pages + `/api/*` endpoints) |
| Imports | Node builtins → third-party → local (`$lib/...`), separated by blank lines |
| Types | Annotate function signatures and return types; prefer `interface` for object shapes |
| Config | Host-coupled infra via env (`.env`); **app config (GitHub, OAuth, Anthropic key, feature gates) is DB-backed** in `app_settings`, edited in the in-app Settings UI — never hardcode secrets |
| Infra | DB migrations and service config live in `infra/`, not app code |

## Naming Conventions

| Element | Convention | Example |
|---|---|---|
| Files/modules | kebab-case | `librarian.ts` |
| Functions | camelCase | `runMigrations()` |
| Types/interfaces/classes | PascalCase | `User`, `SearchEntry` |
| Constants | UPPER_SNAKE | `DEFAULT_DATABASE_URL` |
| DB tables | snake_case, plural | `tasks`, `kb_index` |
| DB columns | snake_case | `created_at` |
| MCP tools | lowercase verb | `recall`, `remember` |

## Key Patterns

- **Database:** PostgreSQL accessed via the `postgres` (porsager) client in
  `apps/web/src/lib/server/db.ts`. Full-text search lives in `librarian.ts`
  (Postgres `tsvector`/`to_tsvector` — **no pgvector**). Migrations are plain SQL
  in `infra/postgres/migrations/` and are applied on boot by `migrate.ts`
  (idempotent — tracked in `schema_migrations`).
- **Canonical DB:** the **bundled Docker Compose `postgres` service** is the
  source of truth (the app defaults to `postgres://nazu:nazu@postgres:5432/nazu`).
  Do not point `DATABASE_URL` at a host Postgres.
- **Object storage:** MinIO holds ingested documents/attachments.
- **Settings/config:** DB-backed via `app_settings` (sections like `oauth`,
  `github`, `ai`, `dashboard`). Auth is constructed lazily from these rows
  (`apps/web/src/auth.ts`, `lib/auth.ts`) — no OAuth/credential env vars.
- **Code graph:** FalkorDB stores per-project code graphs built by `apps/indexer`,
  queried via the `code-graph` MCP and `/api/code-graph/*`. This is FalkorDB's
  only current use.
- **Memory MCP:** `apps/mcp` is a thin stdio MCP over the REST API. Keep it thin —
  all logic stays in `apps/web` server code.
- **Data model:** `tasks`, `kb_index`, `documents`, `document_chunks`,
  `app_settings`, `service_config` (+ `schema_migrations`). `document_chunks`
  holds passage-sized slices of a document body (one FTS `tsvector` per chunk)
  produced by the ingest pipeline (`lib/server/chunk.ts`); the canonical raw body
  stays in MinIO.
- **Error handling:** raise specific errors in `lib/server/` modules; catch and
  format (HTTP status + message) in the `/api/*` route handlers.

## Key Gotchas

- Inside Docker Compose, reach services by name (`postgres`, `minio`, `falkordb`),
  not `localhost`.
- `.env` is for host-coupled infra only (TLS cert paths, `COMPOSE_PROJECT_NAME`,
  optional connection overrides). Almost all app config is in the DB — a fresh
  `docker compose up` works with **no** `.env`.
- `.env` may contain secrets — never commit it. `.env.example` is the template.
- Cloudflare Tunnel is outbound-only — no inbound ports — but the `cloudflared`
  service must be running.
- The Memory MCP uses **stdio** transport — it is a client-side process (e.g. run
  by Claude Code), not a long-running HTTP service, and does **not** belong in
  docker-compose.
- The AI reasoning layer (Claude) is external — nazu only stores/retrieves data;
  it does not call LLMs for inference (excerpt generation on ingest aside).
