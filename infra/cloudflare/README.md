# Cloudflare Tunnel

The nazu web app is exposed publicly via a Cloudflare Tunnel running on the host machine — not inside Docker. The tunnel daemon (`cloudflared`) runs as a host service and proxies HTTPS traffic from your Cloudflare-managed domain to the web container on port 3000.

## How it works

```
Internet → Cloudflare edge (HTTPS) → cloudflared daemon (host) → localhost:3000 (web container)
```

Docker Compose exposes port 3000 on the host. The tunnel routes to `http://localhost:3000`. No inbound firewall ports are needed — the tunnel connection is outbound-only from the host.

## Setup

### 1. Create a tunnel

```bash
cloudflared tunnel create nazu
```

This creates a tunnel and writes credentials to `~/.cloudflared/<TUNNEL_ID>.json`.

### 2. Configure the tunnel

Copy the example config and fill in your values:

```bash
cp infra/cloudflare/tunnel-config.example.yml ~/.cloudflared/config.yml
```

Edit `~/.cloudflared/config.yml` and replace:
- `<TUNNEL_ID>` — the UUID from step 1
- `<USER>` — your Linux username
- `<YOUR_DOMAIN>` — the hostname you want to route (e.g. `nazu.example.com`)

### 3. Route DNS

```bash
cloudflared tunnel route dns nazu <YOUR_DOMAIN>
```

### 4. Start the tunnel

For a one-off test:

```bash
cloudflared tunnel run nazu
```

To run as a systemd service (recommended for production):

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

## Updating routes

If you add new services (e.g. the MCP HTTP/SSE endpoint on port 8001), add an ingress rule to `~/.cloudflared/config.yml` before the catch-all:

```yaml
ingress:
  - hostname: nazu.example.com
    service: http://localhost:3000
  - hostname: mcp.nazu.example.com
    service: http://localhost:8001
  - service: http_status:404
```

Then restart the tunnel: `sudo systemctl restart cloudflared`.
