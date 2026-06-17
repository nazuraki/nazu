# ADR 0001 — Graphiti temporal-knowledge graph for semantic recall

- **Status:** Accepted
- **Date:** 2026-06-17
- **Issue:** [#53](https://github.com/nazuraki/nazu/issues/53)

## Context

Recall was Postgres keyword FTS only (`librarian.ts`: `tsvector`/`plainto_tsquery`
over `kb_index`, `documents.body_search`, and `document_chunks`). For an AI
assistant that's brittle: synonyms, paraphrase, and relationship questions miss,
because FTS matches lexemes, not meaning.

Issue #53 framed three upgrade paths over the FTS baseline:

1. **Embeddings + vector search** — lowest conceptual lift; semantic recall, no
   relationships or temporality. Needs pgvector (deliberately avoided so far) or
   an external store, plus an embedding provider.
2. **Graphiti temporal knowledge graph** (FalkorDB) — relationships, temporality,
   and entity extraction. Matches the stated long-term vision (`PURPOSE.md`);
   heavier; needs an LLM for extraction and an embedder.
3. **Hybrid** — FTS for lexical, graph/vector for semantic + relationships.

## Decision

**Adopt Graphiti (option 2), layered additively on top of the existing FTS
(making the end state a hybrid).** The evaluation behind this decision was done
prior to this issue; Graphiti is the chosen direction because it is the only
option that delivers the relationship + temporal recall the product vision calls
for, and it reuses FalkorDB, already in the stack (today only for the code-graph
indexer).

Implementation choices:

- **Integration:** a thin **FastAPI sidecar we own** (`apps/graphiti/`) wrapping
  `graphiti-core` (Python). `graphiti-core` is Python; the app is TypeScript, and
  a long-running service fits Graphiti's persistent driver/LLM connections far
  better than a per-call subprocess. It mirrors nazu's "thin adapter, logic stays
  put" pattern — recall stays wired through `/api/search`.
- **LLM for entity extraction:** **Anthropic** (reuses the key already in
  `app_settings.ai`; no second paid provider for the LLM).
- **Embedder:** **local Ollama** via its OpenAI-compatible endpoint
  (`nomic-embed-text` by default) — free, self-hosted, and consistent with
  nazu's ethos. Swappable to OpenAI embeddings via sidecar config if quality
  demands it.
- **Config & secrets:** the web app remains the configuration authority. It reads
  the Anthropic key + embedder settings from DB-backed `app_settings` and passes
  them to the sidecar per request; the sidecar persists no secret. Only
  host-coupled values (FalkorDB address, graph name) are sidecar env. A new
  `graph` settings section gates the feature (**off by default**).
- **Document ↔ graph mapping:** Postgres holds only the join key
  (`graph_episodes(document_id, episode_uuid)`); the episode body, entities, and
  edges live in FalkorDB. Recall maps returned facts → episodes → documents →
  `kb_index` entries.

## Rollout (staged)

This issue lands the **service + write path + basic recall**:

- **Write:** after a document is stored, it is added to the graph as an episode
  (best-effort, non-fatal — like excerpt generation). `reference_time` = ingest
  time, giving the graph its temporal axis.
- **Recall:** graph hits **augment** FTS additively — they fill page 1's spare
  slots with semantically-related documents FTS missed, deduped against the FTS
  set and marked `recall_source: 'graph'`. FTS always stands alone if the graph
  is down.

**Deferred to follow-ups:** blended ranking across the full FTS+graph result set;
moving extraction to a background queue (it is LLM-driven and currently
synchronous on the write path); backfilling already-stored documents into the
graph; and upgrading the Memory MCP `recall` formatting to expose graph facts.

## Consequences

- New stack components: a Python service + `graphiti-core`, and per-ingest LLM +
  embedding calls (cost/latency). The feature is off by default, so a fresh
  install is unaffected until enabled.
- The Anthropic + local-embedder combination is the least battle-tested Graphiti
  configuration; because the provider lives in sidecar config, switching the LLM
  or embedder later is a config change, not a rearchitecture.
- FalkorDB now backs **two** graphs: code-graph (`code:*`) and personal knowledge
  (`nazu_knowledge`). Distinct graph names keep them isolated.
