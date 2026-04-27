# nazu — monorepo
# Requires: just, python3, docker, pnpm, ruff

default:
    @just --list

# ─── Web app ──────────────────────────────────────────────────────

# Install all workspace dependencies
install:
    pnpm install

# Run the web app in dev mode
dev:
    pnpm --filter @nazu/web dev

# Build the web app
build:
    pnpm --filter @nazu/web build

# Type-check the web app
check:
    pnpm --filter @nazu/web check

# Lint the web app
lint:
    pnpm --filter @nazu/web lint

# Lint and auto-fix the web app
fix:
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
    docker compose --profile tunnel up -d

# Start all services, rebuilding web
reup:
    docker compose --profile tunnel up -d --build

# Start only backing services (no web container)
up-deps:
    docker compose up -d postgres falkordb caddy

# Stop all services
down:
    docker compose down

# Restart all services
restart: down reup

# ─── Tests ────────────────────────────────────────────────────────

# Run tests
test: test-functional

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

# Reinstall from scratch
fresh: clean install
