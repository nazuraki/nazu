# nazu — Claude Instructions

## First Step: Read CONTEXT.md

**At the start of every session, read `CONTEXT.md` in this directory.** It contains the complete code reference — file maps, architecture, data model, API surfaces. This eliminates the need to re-read source files.

## Project Overview

Personal knowledge management system with an MCP interface. Python backend, PostgreSQL + pgvector for semantic search, Docker Compose for containerization, Cloudflare Tunnel for remote access. Run with `docker compose up`.

## Coding Conventions

| Area | Convention |
|---|---|
| Language | Python 3.12+ |
| File naming | `snake_case.py` |
| Package structure | Layer-per-package: `app/api/`, `app/mcp/`, `app/db/` |
| Imports | Standard lib → third-party → local, separated by blank lines |
| Type hints | Use everywhere — function signatures, return types, class attributes |
| Docstrings | Google style, only for public functions/classes |
| Config | Environment variables via `.env`, never hardcode secrets |
| Scripts | One-off utilities go in `scripts/`, not inside `app/` |

## Naming Conventions

| Element | Convention | Example |
|---|---|---|
| Files/modules | snake_case | `init_db.py` |
| Functions | snake_case | `add_item()` |
| Classes | PascalCase | `ItemModel` |
| Constants | UPPER_SNAKE | `DEFAULT_EMBEDDING_MODEL` |
| DB tables | snake_case, plural | `items` |
| DB columns | snake_case | `created_at` |
| MCP tools | snake_case | `add_item`, `search` |

## Key Patterns

- **Database:** PostgreSQL on host (not containerized), app connects via Docker network. pgvector for embeddings.
- **Embeddings:** Generated at insert time via OpenAI `text-embedding-3-small`. Model is swappable but requires full re-index.
- **MCP tools:** Each tool is a function in `app/mcp/tools.py`, wired up in `app/mcp/server.py`. Keep tools thin — business logic goes in `app/db/`.
- **Data model:** Single `items` table with `type` discriminator (note, task, url, transcript). Metadata stored as JSONB.
- **Error handling:** Raise specific exceptions from `app/db/`, catch and format in `app/mcp/` and `app/api/` layers.

## Key Gotchas

- PostgreSQL runs on the host, not in Docker — use `host.docker.internal` or the host network IP, not `localhost` from containers.
- Changing the embedding model requires re-indexing all items — never change `EMBEDDING_MODEL` without a migration plan.
- Cloudflare Tunnel is outbound-only — no inbound firewall ports needed, but the tunnel daemon must be running on the host.
- `.env` contains API keys — never commit it. Keep `.env.example` as a template.
- The AI reasoning layer (Claude) is external — nazu only stores/retrieves data, it does not call LLMs for inference.
