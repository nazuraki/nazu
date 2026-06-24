# ADR 0003 — /nazu chat: the app calls an LLM for inference (RAG over the KB)

- **Status:** Accepted
- **Date:** 2026-06-24
- **Issue:** [#54](https://github.com/nazuraki/nazu/issues/54)

## Context

nazu had no conversational surface over its knowledge. The `/nazu` page (M1) was
read-only: a keyword-search box plus recent-knowledge and open-task panels.
Answering a question meant the human reading search results themselves.

`CLAUDE.md` stated nazu's reasoning layer is **external**: "nazu only stores/
retrieves data; it does not call LLMs for inference (excerpt generation on ingest
aside)." Retrieval-augmented chat breaks that boundary — to answer a question
from the KB, *something* must call an LLM with the retrieved context.

(The boundary had already softened: ingest generates excerpts via Claude Haiku,
and graph recall (#53, ADR 0001) uses an LLM for entity extraction. Both are
write-path, best-effort augmentations. Chat is the first place nazu calls an LLM
**to answer the user** — a deliberate, user-facing reversal.)

## Decision

**The web app calls Claude directly to answer `/nazu` chat questions via RAG.**
This formally reverses the "no LLM inference" stance for the assistant surface;
the reversal is recorded here and reflected in `CLAUDE.md`.

Implementation choices:

- **Where the call lives:** the SvelteKit app itself (`lib/server/assistant.ts`),
  not a new service. The Anthropic SDK is already a dependency and already used on
  the ingest path, so a dedicated service would add deployment surface for no
  gain. If chat later needs heavier orchestration (tools, multi-agent — #36) it
  can move out then.
- **Retrieval:** reuse the existing Memory layer — `librarian.search()`, which is
  already hybrid (Postgres FTS + graph recall, ADR 0001). Chat does not add a new
  retrieval path; it consumes the one the rest of the app uses. The latest user
  turn is the query (no multi-turn rewriting yet).
- **Context & citations:** the top *K* (6) retrieved entries are rendered into a
  numbered block (`[1]…[K]`) from each entry's title + best chunk snippet (else
  excerpt). The system prompt instructs the model to answer **only** from those
  sources, cite inline by number, and admit when the KB doesn't cover the
  question. The UI resolves cited `[n]` markers back to `kb_index` entries and
  links to them.
- **Model & config:** DB-backed, like all app config. A new `ai.chatModel` field
  (default `claude-sonnet-4-6`) selects the model; the existing `ai.anthropicApiKey`
  is the credential. No key → the endpoint returns 503 and the UI prompts the user
  to add one in Settings → AI. Sonnet (not the Haiku used for excerpts) is the
  default because answering spans multiple sources.
- **Transport:** `POST /api/nazu/chat` streams Server-Sent Events (`sources` first,
  then `delta`s, then `done`/`error`) — same `ReadableStream` + `text/event-stream`
  pattern as the container-logs endpoint. The `/api/nazu` prefix is already
  feature-gated and authenticated centrally (`hooks.server.ts`), so chat inherits
  the API-key / OAuth / CF-Access paths with no new auth code.

## Consequences

- nazu now makes a paid, user-facing LLM call per chat turn. Cost is bounded:
  opt-in per question, ~6 short snippets of context, capped history and answer
  length. Off entirely when no Anthropic key is set.
- The `/nazu` keyword-search box is **repurposed** into the chat composer.
  Dedicated keyword search remains at `/search`.
- Answer quality is capped by retrieval quality and by using snippets/excerpts
  rather than full document bodies (a token-cost tradeoff).

## Deferred to follow-ups

- Richer per-document context (pull full bodies for top hits) instead of snippets.
- Multi-turn query rewriting (retrieve on a condensed view of the conversation,
  not just the latest turn).
- Surfacing chat through the Memory MCP and the voice surface (#35); tool-using /
  multi-agent generalization (#36).
