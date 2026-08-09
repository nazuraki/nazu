# @nazu/mcp — Memory MCP

A thin [Model Context Protocol](https://modelcontextprotocol.io) server that gives
an AI agent (Claude Code, the Gemini mobile surface, etc.) a durable **store and
recall** loop over nazu's knowledge base. It wraps nazu's REST API — no direct DB
access — so it works against a nazu running anywhere reachable.

Built on the v2 TypeScript SDK (`@modelcontextprotocol/server`); `serveStdio`
negotiates per connection, serving both the 2026-07-28 spec revision and
legacy-era (2025-xx) clients.

| Tool | Wraps | Purpose |
|---|---|---|
| `recall` | `GET /api/search` | Full-text search the KB for stored knowledge |
| `remember` | `POST /api/remember` | Store a fact/note/decision (title optional — derived from content) |

## Build

```sh
pnpm --filter @nazu/mcp build      # tsc → dist/server.js
```

## Configure (env)

| Var | Default | Notes |
|---|---|---|
| `NAZU_URL` | `http://localhost:8420` | Base URL of the nazu web app |
| `NAZU_API_KEY` | — | Static key sent as `Authorization: Bearer <key>`. Required unless nazu is in zero-conf open mode on the LAN. Must match a key in the web app's `NAZU_API_KEY`. |

## Register with Claude Code

In `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "nazu-memory": {
      "command": "node",
      "args": ["/path/to/nazu/apps/mcp/dist/server.js"],
      "env": {
        "NAZU_URL": "http://localhost:8420",
        "NAZU_API_KEY": "your-shared-key"
      }
    }
  }
}
```

The agent can then call `remember` to persist knowledge and `recall` to retrieve it
in any future session.

## Auth

Set the same `NAZU_API_KEY` on the **web app** (see root `.env.example`) and on this
MCP. The web app accepts the key via `Authorization: Bearer` or `X-API-Key` and
stamps the request as the `agent@nazu.local` identity. Multiple keys may be set on
the web side as a comma-separated list (e.g. one per client).
