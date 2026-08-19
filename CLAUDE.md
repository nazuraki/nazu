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
| `apps/graphiti/` | **Graphiti sidecar** — a thin Python (FastAPI) wrapper over `graphiti-core` for temporal-knowledge recall (#53). Owns no config; the web app passes credentials per request. Off by default; a profile-gated optional service (`profiles: ["graph"]`). |
| `apps/discord/` | **Discord ingest sidecar** — a thin TypeScript bot (#34) that watches channels for YouTube/TikTok links and ingests transcripts via the web app's `POST /api/ingest/url`. Owns no logic; pulls config from `GET /api/discord/config`. Off by default; a profile-gated optional service (`profiles: ["discord"]`). See [ADR 0002](docs/adr/0002-discord-transcript-ingest.md). |
| `apps/usr/` | **User management** — centralized users, app-scoped roles, permission strings. Hono API + React SPA (backplane pattern); own Postgres in its **own compose project** (`just usr-up`), deployed via the backplane. Other apps query `GET /api/permissions?email=&app=` with a role-mapped API key (Keys UI, seeded `usr/service` role). See [ADR 0004](docs/adr/0004-usr-user-management.md). |
| `apps/backplane/` | **Deploy backplane** (#75) — control plane for the dev server: project registry, git-driven `docker compose` deploys, image-update polling, container status/logs, Prometheus metrics proxy. Hono API + React SPA + stdio MCP as equal clients. Runs as its **own compose project** (`just backplane-up`) with Prometheus + cAdvisor + Grafana — never inside a stack it manages. |
| `infra/` | DB migrations, Caddy/Cloudflare config, git hooks. |

> **Partially built:** the Graphiti temporal knowledge graph (semantic/relationship
> recall, the long-term vision in `docs/PURPOSE.md`) now has a first cut — see
> [ADR 0001](docs/adr/0001-graphiti-temporal-recall.md). The `apps/graphiti/`
> sidecar indexes ingested documents into a `nazu_knowledge` graph in FalkorDB and
> augments FTS recall, **gated behind the `graph` setting and off by default**.
> Blended ranking, background extraction, and backfill are not yet done.

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
  `github`, `ai`, `dashboard`, `graph`). Auth is constructed lazily from these
  rows (`apps/web/src/auth.ts`, `lib/auth.ts`) — no OAuth/credential env vars.
- **Code graph:** FalkorDB stores per-project code graphs built by `apps/indexer`,
  queried via the `code-graph` MCP and `/api/code-graph/*` (the `code:*` graphs).
- **Graph recall:** FalkorDB also backs the personal-knowledge graph
  (`nazu_knowledge`) via the `apps/graphiti/` sidecar. The web client
  (`lib/server/graphiti.ts`) adds an episode per ingested document (best-effort,
  non-fatal) and augments FTS recall with graph hits in `librarian.ts`. Gated by
  the `graph` setting, off by default. See [ADR 0001](docs/adr/0001-graphiti-temporal-recall.md).
- **Assistant (RAG chat):** the `/nazu` page is a chat surface. `POST /api/nazu/chat`
  streams a grounded answer (SSE) via `lib/server/assistant.ts`, which retrieves KB
  context with `librarian.search()`, hands it to Claude as numbered citable sources,
  and streams the reply. **This is the one place nazu calls an LLM to answer the
  user** — see the gotcha below and [ADR 0003](docs/adr/0003-rag-chat-app-calls-llm.md).
  Model is `ai.chatModel` (default `claude-sonnet-4-6`); needs `ai.anthropicApiKey`.
- **Memory MCP:** `apps/mcp` is a thin stdio MCP over the REST API. Keep it thin —
  all logic stays in `apps/web` server code.
- **usr (users/permissions):** `apps/usr` owns users, app-scoped roles and
  permission strings in its own Postgres. Apps are string namespaces; admins
  pre-provision users by email (OAuth login only succeeds for provisioned
  emails). API keys are DB-backed and role-mapped like users (no env key);
  hot path for other apps: `GET /api/permissions?email=&app=` with a key
  holding `permissions:read` (seeded `usr/service` role). Auth ladder mirrors
  the web app (API key → session → Basic → zero-conf open); OAuth config is
  DB-backed. See [ADR 0004](docs/adr/0004-usr-user-management.md).
- **Backplane:** `apps/backplane` is API-first — all logic in `src/server/lib/`,
  Hono routes only translate HTTP; the React UI and the backplane MCP are equal
  REST clients. Registry state is SQLite via `node:sqlite` (no DB service).
  Deploy checkouts live on the **host** at `$BACKPLANE_WORKDIRS`, mirrored into
  the container at the identical path so repo-relative bind mounts in managed
  compose files resolve for the host daemon ([ADR 0005](docs/adr/0005-host-visible-backplane-workdirs.md)).
  Caddy publishes Prometheus metrics on host port 2020 (plain HTTP, `tls`
  profile) for the backplane's Prometheus to scrape.
- **Data model:** `tasks`, `kb_index`, `documents`, `document_chunks`,
  `graph_episodes`, `app_settings`, `service_config` (+ `schema_migrations`).
  `document_chunks` holds passage-sized slices of a document body (one FTS
  `tsvector` per chunk) produced by the ingest pipeline (`lib/server/chunk.ts`);
  the canonical raw body stays in MinIO. `graph_episodes` maps Graphiti episode
  uuids back to documents so graph facts resolve to `kb_index` entries.
- **Error handling:** raise specific errors in `lib/server/` modules; catch and
  format (HTTP status + message) in the `/api/*` route handlers.

## Key Gotchas

- Inside Docker Compose, reach services by name (`postgres`, `minio`, `falkordb`),
  not `localhost`.
- `.env` is for host-coupled infra only (TLS cert paths, `COMPOSE_PROJECT_NAME`,
  optional connection overrides). Almost all app config is in the DB — a fresh
  `docker compose up` works with **no** `.env`.
- `.env` may contain secrets — never commit it. `.env.example` is the template.
- Public access arrives via the Cloudflare Tunnel in the shared edge stack
  (switchboard) — this stack runs no `cloudflared` and opens no inbound ports.
- The Memory MCP uses **stdio** transport — it is a client-side process (e.g. run
  by Claude Code), not a long-running HTTP service, and does **not** belong in
  docker-compose.
- nazu **does** call an LLM (Claude) for the `/nazu` RAG chat — the app retrieves
  KB context and asks Claude to answer from it ([ADR 0003](docs/adr/0003-rag-chat-app-calls-llm.md)).
  This reverses the original "reasoning layer is external" stance. Beyond chat, LLM
  use stays to write-path augmentation: excerpt generation on ingest and graph
  entity extraction (#53). nazu is not otherwise an inference engine — storage and
  retrieval remain the core.
