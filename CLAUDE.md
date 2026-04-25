# nazu — Claude Instructions

## First Step: Read CONTEXT.md

**At the start of every session, read `CONTEXT.md` in this directory.** It contains the complete code reference — file maps, architecture, data model, API surfaces. This eliminates the need to re-read source files.

## Project Overview

Personal knowledge management system / second brain with an MCP interface. Monorepo: Python MCP server in `apps/mcp/`, SvelteKit web app in `apps/web/` (in progress). PostgreSQL + FalkorDB (via Graphiti) for structured and graph storage. All services run via Docker Compose.

## Coding Conventions

| Area | Convention |
|---|---|
| Language | Python 3.12+ (`apps/mcp/`), TypeScript (`apps/web/`) |
| File naming | `snake_case.py` (Python), `kebab-case.ts` (TS) |
| Package structure | `apps/mcp/server/` (MCP layer), `apps/mcp/db/` (data layer) |
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

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **nazu** (182 symbols, 296 relationships, 12 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/nazu/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/nazu/context` | Codebase overview, check index freshness |
| `gitnexus://repo/nazu/clusters` | All functional areas |
| `gitnexus://repo/nazu/processes` | All execution flows |
| `gitnexus://repo/nazu/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
