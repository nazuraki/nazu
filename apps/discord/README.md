# nazu-discord

Thin Discord sidecar for nazu's automated ingest (issue #34). It watches
configured Discord channels for YouTube/TikTok links and ingests their
transcripts into the knowledge base.

Like the Memory MCP, it's deliberately thin: it owns no business logic. URL
classification, transcript fetching, and storage all live in the web app
(`apps/web/src/lib/server/transcript.ts` + `POST /api/ingest/url`). The bot just
connects to the gateway, finds links, calls that endpoint, and reacts.

## Flow

1. On boot (and every `DISCORD_CONFIG_REFRESH_MS`), pull config from the web
   app's `GET /api/discord/config` — enabled flag, bot token, watched channels,
   reaction toggle. Toggling the bot or editing channels in the Settings UI
   takes effect on the next poll, no restart needed.
2. When enabled, connect to the gateway and watch the configured channels.
3. For each YouTube/TikTok link in a message, `POST /api/ingest/url`.
4. React on the message to acknowledge: ✅ ingested · ♻️ already stored ·
   ⚠️ no transcript available · ❌ error. Unsupported links are ignored.

## Config

DB-backed (edited in the in-app **Settings → Discord ingest bot**): enabled,
bot token, watched channel IDs, status reactions. The sidecar fetches these at
runtime — nothing app-level lives in env.

Env (bootstrap only):

| Var | Default | Notes |
|---|---|---|
| `NAZU_URL` | `http://web:3000` | Compose-internal web app base URL. |
| `NAZU_API_KEY` | _(empty)_ | Bearer key for the REST API; only needed when the web app isn't in zero-conf open mode. |
| `DISCORD_CONFIG_REFRESH_MS` | `60000` | Config poll interval. |

## Discord setup

The bot needs the **Message Content** privileged intent enabled in the Discord
developer portal (Bot → Privileged Gateway Intents), plus permission to read the
watched channels and add reactions. Invite it with the `bot` scope and the
Read Messages / Send Messages / Add Reactions permissions.

## Run

Optional, off by default. Start it from the in-app **Optional services** toggle
(once a bot token is set) or:

```sh
docker compose --profile discord up -d discord
```

## Tests

```sh
just discord-test     # from the repo root
# or, in this directory:
pnpm test
```

Tests cover the pure logic — link extraction, config parsing, the ingest client,
and reaction mapping (network injected/mocked). The live gateway connection and
real transcript fetching are verified manually via `docker compose up`.
