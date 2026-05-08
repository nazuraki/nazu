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

Personal knowledge management system and home dashboard. Monorepo: SvelteKit web app in `apps/web/`. PostgreSQL + FalkorDB (via Graphiti) for structured and graph storage. All services run via Docker Compose.

## Coding Conventions

| Area | Convention |
|---|---|
| Language | TypeScript (`apps/web/`), Python 3.12+ (`apps/mcp/`, dormant) |
| File naming | `kebab-case.ts` (TS), `snake_case.py` (Python) |
| Package structure | `apps/web/src/lib/server/` (server logic), `apps/web/src/routes/` (SvelteKit routes) |
| Imports | Standard lib → third-party → local, separated by blank lines |
| Type hints | Use everywhere — function signatures, return types, class attributes |
| Docstrings | Google style, only for public functions/classes |
| Config | Environment variables via `.env`, never hardcode secrets |
| Infra scripts | DB init and service config go in `infra/`, not in app code |

## Naming Conventions

| Element | Convention | Example |
|---|---|---|
| Files/modules | snake_case | `graphiti.py` |
| Functions | snake_case | `add_task()` |
| Classes | PascalCase | `TaskCreate` |
| Constants | UPPER_SNAKE | `ALL_STATEMENTS` |
| DB tables | snake_case, plural | `tasks`, `kb_index` |
| DB columns | snake_case | `created_at` |
| MCP tools | snake_case | `remember`, `recall` |

## Key Patterns

- **Database:** PostgreSQL (containerized via Docker Compose). No pgvector — semantic/graph search is handled by Graphiti/FalkorDB.
- **Graph:** Graphiti (`graphiti-core`) wraps FalkorDB for temporal knowledge graph storage. OpenAI used internally for entity extraction.
- **MCP tools:** Each tool is a function in `apps/mcp/server/tools.py`, wired up in `apps/mcp/server/server.py`. Keep tools thin — business logic goes in `apps/mcp/db/`.
- **Data model:** Two tables — `tasks` (structured task records) and `kb_index` (curated index entries). Unstructured knowledge lives in Graphiti, not Postgres.
- **Error handling:** Raise specific exceptions from `apps/mcp/db/`, catch and format in `apps/mcp/server/`.

## Key Gotchas

- All services run in Docker Compose — use service names (e.g. `falkordb`, `postgres`) as hostnames, not `localhost`.
- Cloudflare Tunnel is outbound-only — no inbound firewall ports needed, but the tunnel daemon must be running on the host.
- `.env` contains API keys — never commit it. Keep `.env.example` as a template.
- The AI reasoning layer (Claude) is external — nazu only stores/retrieves data, it does not call LLMs for inference.
- MCP server uses stdio transport — it is not a long-running HTTP service and does not belong in docker-compose.
