# Claude Code / Nazu Integration Layer

## Overview

A Claude Code integration layer that uses Nazu as its backend for session memory, event capture, and context retrieval. Distinct from Steward (which is a separate GitHub automation orchestrator). This is purely about making Claude Code sessions smarter and more persistent.

## Motivation

- Claude Code sessions lose context on compaction — decisions, open threads, files touched
- Raw tool output (bash, grep, curl) bloats the context window unnecessarily
- Flat file approaches (summarize-to-disk) work but have poor retrieval ergonomics
- Nazu's pgvector backend gives semantic search across sessions for free

## Architecture

Three layers, each independently useful and incrementally adoptable.

### 1. Hook Layer (Session Memory)

Claude Code hooks that write to and read from Nazu.

**PostToolUse** — captures granular events as Nazu `event` items:
- File reads/edits/writes
- Git operations
- Errors and non-zero exit codes
- User decisions and corrections (where hook surface allows)

**PreCompact** — rolls up pending events into a Nazu `session` item:
- Short summary (content field, embedded for semantic search)
- Metadata: `project` (via topics), `date`, `open_threads[]`, `files_touched[]`, `decisions[]`
- Optionally purge raw `event` items after rollup

**SessionStart** — queries Nazu for relevant prior context:
- Semantic search (`search` tool) filtered by project topic
- Injects recent session summaries into context
- Model picks up where it left off without re-prompting

### 2. Generic Tools

A small shared MCP tool set covering the highest-volume raw bash/grep offenders. Not comprehensive on day one — let usage logs drive expansion.

Initial candidates:
- `run_tests` — run test suite, return structured failure summary only
- `search_codebase` — grep/ripgrep wrapper, returns ranked matches with context, not raw output
- `git_log` — summarized commit history rather than raw `git log` dump
- `fetch_and_summarize` — fetch URL, return intent-filtered summary

All generic tool calls are logged as events in Nazu, enabling usage analysis.

### 3. Project Plugins

Per-project MCP tools exposing domain-specific vocabulary. Registered independently, used alongside the generic layer.

Examples:
- Loreweave: `get_world_entity`, `find_related_lore`, `list_unlinked_entries`
- ntl-torrent: `get_failing_tests`, `list_open_trackers`, `check_peer_stats`
- Nazu: `get_needs_review`, `summarize_topic`

Plugins are added as friction is felt, not anticipated upfront.

## Nazu Data Model

No schema changes required. New item types use the existing `type` discriminator + JSONB metadata pattern.

### `session` type
| Field | Value |
|---|---|
| `content` | Session summary (short or long-form) |
| `topics[]` | Project identity (e.g. `["ntl-torrent"]`) |
| `metadata.date` | Session date |
| `metadata.open_threads[]` | Unresolved items |
| `metadata.files_touched[]` | Files modified during session |
| `metadata.decisions[]` | Key decisions made |

### `event` type
| Field | Value |
|---|---|
| `content` | Event description |
| `topics[]` | Project identity |
| `metadata.session_id` | Parent session UUID |
| `metadata.event_type` | `file_edit`, `decision`, `error`, `git_op`, etc. |

## Vocabulary Expansion Process

1. All generic tool calls and raw bash/grep invocations are logged as `event` items
2. Periodically query Nazu for high-frequency event patterns
3. Repeated patterns become candidates for new generic or project-specific tools
4. Tools get added to the appropriate layer (generic if cross-project, plugin if project-specific)

This avoids over-engineering the vocabulary upfront — actual usage drives what gets wrapped.

## Open Questions

- Whether generic tools live in a standalone MCP server or alongside Nazu's existing MCP
- Hook package distribution — per-project install vs global `~/.claude/` install
- How much session event detail to retain vs purge after rollup
- Long-form vs short-form session summary strategy (or both, per Kevin's pattern)
