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

# ─── Web app ──────────────────────────────────────────────────────

# Install all workspace dependencies
web-install:
    pnpm install

# Run the web app in dev mode
web-dev:
    pnpm --filter @nazu/web dev

# Build the web app
web-build:
    pnpm --filter @nazu/web build

# Type-check the web app
web-check:
    pnpm --filter @nazu/web check

# Lint the web app
web-lint:
    pnpm --filter @nazu/web lint

# Lint and auto-fix the web app
web-fix:
    pnpm --filter @nazu/web lint:fix

# ─── Infrastructure ───────────────────────────────────────────────

# Build Docker image for the web app (use --no-cache to force full rebuild)
docker-build *flags:
    docker compose build {{flags}} web

# Build Docker image, bypassing layer cache
docker-rebuild:
    docker compose build --no-cache web

# Start all services (web + postgres + falkordb)
up:
    docker compose up -d

# Start only backing services (no web container)
up-deps:
    docker compose up -d postgres falkordb

# Stop all services
down:
    docker compose down

# ─── Tests ────────────────────────────────────────────────────────

# Run functional tests (spins up an isolated stack, runs vitest, tears down)
test-functional:
    pnpm --filter @nazu/tests-functional test

# Bring the test stack up without running tests (debugging)
test-up:
    docker compose -p nazu-test -f docker-compose.yml -f docker-compose.test.override.yml up -d --build --wait

# Tear down the test stack
test-down:
    docker compose -p nazu-test -f docker-compose.yml -f docker-compose.test.override.yml down -v --remove-orphans

# ─── Repo-wide ────────────────────────────────────────────────────

# Install local git hooks (post-commit GitNexus re-indexer)
init:
    mkdir -p .git/hooks
    install -m 0755 infra/git/post-commit .git/hooks/post-commit
    @echo "Installed: .git/hooks/post-commit"

# Remove caches and venvs
clean:
    rm -rf apps/mcp/.venv
    find . -name '__pycache__' -type d | xargs rm -rf
