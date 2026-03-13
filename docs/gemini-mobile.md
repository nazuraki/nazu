# Gemini Mobile Integration — Pixel 10 / Voice Access

## Goal

Voice-driven access to nazu via Gemini Live on a Pixel 10. Say "check my second brain for..." and Gemini retrieves, speaks the answer.

## Why Pixel 10 Specifically

The Pixel 10's **Tensor G5** chip supports **Local Tool Orchestration**: when the MCP server is reachable on the local network, the Gemini app can route tool calls directly without hitting Google's cloud. This keeps data on-network and reduces latency for voice interactions.

---

## Architecture

### Two Access Modes

| Mode | Transport | When Used |
|---|---|---|
| **Gemini CLI (desktop)** | stdio | Running `gemini` on the same host as nazu |
| **Gemini App (Pixel)** | HTTP/SSE | Gemini app dials out to Cloudflare Tunnel URL |

nazu currently exposes a **stdio** MCP server. For Pixel access, a second entry point exposing **Streamable HTTP or SSE** transport is needed. FastMCP supports both transports natively.

### Network Path (Pixel to nazu)

```
Pixel 10 (Gemini app)
    ↓  HTTPS
Cloudflare Edge
    ↓  Cloudflare Tunnel (outbound daemon on host)
nazu host (Ubuntu Server 24.04)
    ↓
nazu MCP server (HTTP/SSE transport)
    ↓
PostgreSQL + pgvector
```

On local Wi-Fi, Tensor G5 Local Tool Orchestration can short-circuit the Cloudflare hop and hit the host IP directly.

---

## Gemini CLI Extension

Gemini CLI Extensions package an MCP server configuration into a portable, installable unit. Once installed and registered to your Google account, the tool definitions sync to the Gemini app on your Pixel.

### Directory Layout

```
nazu-extension/
├── gemini-extension.json
└── GEMINI.md              # Optional: persistent context injected into Gemini
```

### `gemini-extension.json`

```json
{
  "name": "nazu",
  "version": "1.0.0",
  "description": "Voice-enabled access to nazu — personal knowledge base.",
  "contextFileName": "GEMINI.md",
  "mcpServers": {
    "nazu": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/inspector", "https://your-tunnel-url.trycloudflare.com/sse"],
      "env": {
        "NAZU_API_KEY": "${env:NAZU_API_KEY}"
      }
    }
  },
  "settings": [
    {
      "name": "Nazu API Key",
      "description": "Secret key for authenticating with the nazu MCP server",
      "envVar": "NAZU_API_KEY",
      "sensitive": true
    }
  ]
}
```

The `@modelcontextprotocol/inspector` package bridges the stdio-based Gemini CLI extension runner to the SSE endpoint exposed by nazu. For the Pixel, Gemini dials the SSE URL directly.

### Installation

```bash
# Development (symlink, changes take effect immediately)
gemini extensions link /path/to/nazu-extension/

# Production (installs a copy, update manually)
gemini extensions install /path/to/nazu-extension/
```

Then on the Pixel: **Gemini app → Profile → Settings → Extensions → nazu → Enable**.

---

## What Needs to Be Built

### 1. HTTP/SSE Transport Entry Point (Medium effort)

Add a second server entry point alongside the existing stdio server. FastMCP supports this via `transport="sse"` or `transport="streamable-http"`.

```python
# app/mcp/server_http.py (new file)
mcp.run(transport="streamable-http", host="0.0.0.0", port=8001)
```

The Docker Compose setup will need to expose port 8001, and Cloudflare Tunnel must be configured to route to it.

### 2. Authentication (API key)

The SSE endpoint will be publicly reachable via Cloudflare Tunnel. A static Bearer token check in middleware is the right approach for a personal tool. The key is injected via the extension's `settings` field (stored in system keychain on desktop, synced securely to mobile).

Add `NAZU_API_KEY` to `.env` and validate the `Authorization: Bearer <key>` header in the HTTP entry point before any tool calls are dispatched.

### 3. Extension Directory (Low effort)

Create `nazu-extension/` in the repo with `gemini-extension.json` and a `GEMINI.md` giving Gemini context on what nazu contains and how to query it effectively (item types, search vs. list, etc.).

---

## Open Questions

- Confirm exact Cloudflare Tunnel route config for the SSE endpoint (path vs. subdomain)
- Verify Gemini app on Pixel reads extensions synced via `gemini extensions install` (Google account sync behavior is not documented in Gemini CLI extension docs)
- Determine if Local Tool Orchestration requires the server on a specific local port or mDNS name
