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
| **Gemini CLI (desktop)** | stdio | Running  on the same host as nazu |
| **Gemini App (Pixel)** | HTTP/SSE | Gemini app dials out to Cloudflare Tunnel URL |

nazu currently exposes a **stdio** MCP server. For Pixel access, a second entry point exposing **Streamable HTTP or SSE** transport is needed. FastMCP supports both transports natively.

### Network Path (Pixel → nazu)



On the local Wi-Fi, Tensor G5 Local Tool Orchestration can short-circuit the Cloudflare hop and hit the host IP directly.

---

## Gemini CLI Extension

Gemini CLI Extensions package an MCP server configuration into a portable, installable unit. Once installed and registered to your Google account, the tool definitions sync to the Gemini app on your Pixel.

### Directory Layout



### 



The  package bridges the stdio-based Gemini CLI extension runner to the SSE endpoint exposed by nazu. For Pixel, Gemini dials the SSE URL directly.

### Installation



Then on the Pixel: **Gemini app → Profile → Settings → Extensions → nazu → Enable**.

---

## What Needs to Be Built

### 1. HTTP/SSE Transport Entry Point (Medium effort)

Add a second server entry point alongside the existing stdio server. FastMCP supports this via  or .



The Docker Compose setup will need to expose port 8001, and Cloudflare Tunnel must be configured to route to it.

### 2. Authentication (High effort)

The SSE endpoint will be publicly reachable via Cloudflare Tunnel. It must be protected. Options:

| Approach | Complexity | Notes |
|---|---|---|
| **Static API key header** | Low | Simple Bearer token check in a middleware layer. Practical for personal use. |
| **OAuth2** | High | Required if extension is ever shared or published. |

A static API key injected via the extension's  (stored in system keychain) is the right starting point.

### 3. Extension Directory (Low effort)

Create  with  and a  giving Gemini context on what nazu contains and how to query it effectively.

---

## Open Questions

- Confirm exact Cloudflare Tunnel route config for the SSE endpoint (path vs. subdomain)
- Verify Gemini app on Pixel reads extensions synced via  (Google account sync behavior is not documented in Gemini CLI extension docs)
- Decide on API key vs. OAuth2 for auth
- Determine if Local Tool Orchestration requires the server on a specific local port/mDNS name
