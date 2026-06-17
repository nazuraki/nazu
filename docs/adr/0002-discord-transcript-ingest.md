# ADR 0002 — Discord bot as an automated transcript-ingest source

- **Status:** Accepted
- **Date:** 2026-06-17
- **Issue:** [#34](https://github.com/nazuraki/nazu/issues/34)

## Context

Milestone M2 ("Knowledge pipeline") calls for automated ingest sources, the
first being a Discord bot that watches channels for YouTube/TikTok links and
ingests their transcripts. A gateway bot is a long-running websocket process —
it can't be a per-request handler in the SvelteKit app — and transcript fetching
needs third-party libraries. Two questions the issue flagged: where the fetch +
ingest logic lives, and how the bot gets its (secret) config given nazu's
"app config is DB-backed, a fresh `docker compose up` needs no `.env`" rule.

## Decision

**Split the work: a thin Discord sidecar (`apps/discord/`) + all real logic in
the web app.** This mirrors the existing "thin adapter, logic stays put" pattern
(`apps/mcp`, `apps/graphiti`).

- **Logic in the web app.** A new `lib/server/transcript.ts` classifies a URL and
  fetches its transcript behind a per-platform registry; `POST /api/ingest/url`
  fetches and stores via the existing `storeDocument` pipeline. This keeps the
  hard, testable logic in the web app's vitest suite, reuses ingest/chunking/
  excerpt/graph, and makes the endpoint reusable by any future automated source.
- **Sidecar stays thin.** `apps/discord/` only connects to the gateway, extracts
  YouTube/TikTok links, calls `/api/ingest/url`, and reacts to acknowledge. Its
  pure pieces (link extraction, config parse, ingest client, reaction mapping)
  are unit-tested; the live gateway + real network fetch are a manual smoke test.
- **Config delivery: DB-backed, fetched by the sidecar.** A `discord` settings
  section (enabled, bot token, channels, reactions) is edited in the Settings UI
  like every other secret. The sidecar pulls it — including the token — from an
  authenticated internal `GET /api/discord/config` on boot and on a poll
  interval, so enable/disable and channel edits take effect without a restart.
  Only bootstrap values (`NAZU_URL`, `NAZU_API_KEY`) are env. Trade-off: that
  endpoint returns a secret to an authenticated caller on the compose-internal
  network — accepted as analogous to how the Graphiti sidecar receives the
  Anthropic key, and in keeping with the no-secrets-in-env convention.
- **Optional service, off by default.** Registered in `services.ts` and gated by
  `profiles: ["discord"]`, so the image is excluded from the default and test/CI
  stacks until turned on (mirrors the `graph` sidecar).
- **Transcript sources.** YouTube: public oEmbed (no API key) for title/author +
  the unofficial `youtube-transcript` for the body, wrapped behind our interface
  so it's swappable. **TikTok: a deliberate stub** behind the same seam — there's
  no official captions API and scraping is flaky/low-yield, so it reports
  "unavailable" until a real fetcher is warranted. Ingest is idempotent by
  `source_url` so the same link posted twice is stored once.

## Consequences

- New dependencies: `discord.js` (sidecar gateway) and `youtube-transcript` (web).
  The latter is unofficial and will break when YouTube changes or rate-limits the
  server IP; the per-platform registry localizes the blast radius and the swap.
- The bot needs the **Message Content** privileged intent enabled in the Discord
  developer portal, plus read/react permissions on watched channels.
- Off by default, so a fresh install is unaffected until enabled.
- TikTok links are recognized but not yet transcribed; adding a real fetcher is a
  drop-in at the registry, no caller changes.
