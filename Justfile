# nazu — monorepo
# Requires: just, python3, docker, pnpm, ruff

default:
    @just --list

# ─── MCP server ──────────────────────────────────────────────────

# Create .venv and install dependencies for the MCP server
mcp-install:
    cd apps/mcp && /opt/homebrew/bin/python3.14 -m venv .venv
    apps/mcp/.venv/bin/pip install -r apps/mcp/requirements.txt -r apps/mcp/requirements-dev.txt

# Run the MCP server (stdio transport)
mcp-run:
    cd apps/mcp && .venv/bin/python -m server.server

# Lint the MCP server
mcp-lint:
    cd apps/mcp && ../.venv/bin/ruff check .

# Fix lint and formatting for the MCP server
mcp-fix:
    apps/mcp/.venv/bin/ruff check apps/mcp --fix
    apps/mcp/.venv/bin/ruff format apps/mcp

# ─── Infrastructure ───────────────────────────────────────────────

# Start FalkorDB
up:
    docker compose up -d falkordb

# Stop all services
down:
    docker compose down

# ─── Repo-wide ────────────────────────────────────────────────────

# Remove caches and venvs
clean:
    rm -rf apps/mcp/.venv
    find . -name '__pycache__' -type d | xargs rm -rf
