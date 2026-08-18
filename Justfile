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

check: typecheck lint test-unit discord-check discord-test backplane-check backplane-lint backplane-test usr-check usr-lint usr-test

# Run exactly what CI runs (.github/workflows/ci.yml): the core suite (lint,
# typecheck, unit, functional) then the gated optional pieces. Needs Docker. Use
# `check` for the fast inner loop; use this before pushing to mirror CI.
ci: lint typecheck test-unit discord-check discord-test backplane-check backplane-lint backplane-test usr-check usr-lint usr-test test-functional test-optional

# Type-check the web app
typecheck:
    pnpm --filter @nazu/web check

# Lint the web app
lint:
    pnpm --filter @nazu/web lint

# Run fast web unit tests (no docker stack)
test-unit:
    pnpm --filter @nazu/web test

# Lint and auto-fix the web app
fix:
    pnpm --filter @nazu/web lint:fix

# ─── Discord ingest sidecar ───────────────────────────────────────

# Type-check the Discord ingest sidecar
discord-check:
    pnpm --filter @nazu/discord check

# Run the Discord sidecar unit tests (pure logic — no live gateway/network)
discord-test:
    pnpm --filter @nazu/discord test

# ─── Backplane (deploy control plane, #75) ────────────────────────

# Type-check the backplane (server + UI)
backplane-check:
    pnpm --filter @nazu/backplane check

# Lint the backplane
backplane-lint:
    pnpm --filter @nazu/backplane lint

# Run the backplane unit tests
backplane-test:
    pnpm --filter @nazu/backplane test

# Build + start the backplane's own compose project (separate from nazu's stack)
backplane-up:
    docker compose -p backplane -f apps/backplane/docker-compose.yml up -d --build

# Stop the backplane stack
backplane-down:
    docker compose -p backplane -f apps/backplane/docker-compose.yml down

# Update the backplane from the published image (server self-update, no build)
backplane-update:
    docker compose -p backplane -f apps/backplane/docker-compose.yml pull backplane
    docker compose -p backplane -f apps/backplane/docker-compose.yml up -d

# ─── usr (user management) ────────────────────────────────────────

# Type-check usr (server + UI)
usr-check:
    pnpm --filter @nazu/usr check

# Lint usr
usr-lint:
    pnpm --filter @nazu/usr lint

# Run the usr unit tests
usr-test:
    pnpm --filter @nazu/usr test

# Run the usr server in dev mode (tsx watch; needs the usr postgres)
usr-dev:
    pnpm --filter @nazu/usr dev

# Run the usr SPA in dev mode (vite; proxies /api to :8432)
usr-dev-ui:
    pnpm --filter @nazu/usr dev:ui

# Build + start usr's own compose project (separate from nazu's stack)
usr-up:
    docker compose -p usr -f apps/usr/docker-compose.yml up -d --build

# Stop the usr stack
usr-down:
    docker compose -p usr -f apps/usr/docker-compose.yml down

# Update usr from the published image (what the backplane does)
usr-update:
    docker compose -p usr -f apps/usr/docker-compose.yml pull usr
    docker compose -p usr -f apps/usr/docker-compose.yml up -d

# ─── Infrastructure ───────────────────────────────────────────────

# Build Docker image for the web app (use --no-cache to force full rebuild)
docker-build *flags:
    docker compose build {{flags}} web

# Build Docker image, bypassing layer cache
docker-rebuild:
    docker compose build --no-cache web

# Start the core stack (web, postgres, minio, falkordb)
up:
    docker compose up -d

# Start the core stack, rebuilding web
reup:
    docker compose up -d --build

# Update the core stack from published images (no build; what the backplane does)
update:
    docker compose pull
    docker compose up -d --remove-orphans

# Start only backing services (no web container)
up-deps:
    docker compose up -d postgres falkordb minio

# Stop all services
down:
    docker compose down

# Restart all services
restart: down reup

# ─── Database ─────────────────────────────────────────────────────

# Back up the canonical DB (the bundled compose `postgres` service) to ./backups
db-backup:
    mkdir -p backups
    docker compose exec -T postgres pg_dump -U nazu -d nazu --no-owner --no-privileges > "backups/nazu-$(date +%Y%m%d-%H%M%S).sql"
    @ls -1t backups/nazu-*.sql | head -1 | sed 's/^/Wrote /'

# Restore a dump into the canonical DB: just db-restore backups/nazu-YYYYmmdd-HHMMSS.sql
db-restore file:
    docker compose exec -T postgres psql -U nazu -d nazu -v ON_ERROR_STOP=1 < "{{file}}"

# Open a psql shell on the canonical DB
db-shell:
    docker compose exec postgres psql -U nazu -d nazu

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

# Python interpreter for the Graphiti sidecar tests (3.10+ required)
graphiti_python := "/opt/homebrew/bin/python3.14"

# Run the Graphiti sidecar contract tests. graphiti-core is stubbed (conftest.py),
# so no FalkorDB / LLM / embeddings endpoint is needed — only the FastAPI contract.
graphiti-test:
    cd apps/graphiti && {{graphiti_python}} -m venv .venv && .venv/bin/pip install -q fastapi 'pydantic>=2.7' pytest httpx && .venv/bin/pytest -q

# Test the optional pieces (Graphiti sidecar): contract tests, then build + boot
# the real image and health-check it via `--wait`. Heavy (builds the Python
# image) — `just ci` runs it only after the core suite passes. Isolated compose
# project so it never touches a running dev/test stack. Mirrors CI's test-optional.
test-optional: graphiti-test
    docker compose -p nazu-optional --profile graph up -d --build --wait --no-deps graphiti || { docker compose -p nazu-optional --profile graph logs graphiti; docker compose -p nazu-optional --profile graph down -v --remove-orphans; exit 1; }
    docker compose -p nazu-optional --profile graph down -v --remove-orphans
    # The Discord sidecar has no live deps to boot against in CI; just prove the
    # image builds (its pure logic is covered by discord-test).
    docker compose -p nazu-optional --profile discord build discord

# ─── Code graph indexer ───────────────────────────────────────────

# Build the indexer (TypeScript + Rust binary + Go binary)
build-indexer:
    pnpm --filter @nazu/indexer build
    cargo build --release --manifest-path apps/indexer/native/rust-indexer/Cargo.toml
    cd apps/indexer/native/go-indexer && go build -o go-indexer .

# Index a registered project by name (default: nazu)
index project="nazu":
    pnpm --filter @nazu/indexer exec tsx src/cli.ts --project {{project}}

# Index an arbitrary path into a named graph
index-path path graph:
    pnpm --filter @nazu/indexer exec tsx src/cli.ts --path $(realpath {{path}}) --graph {{graph}}

# Install indexer npm deps only
install-indexer:
    pnpm --filter @nazu/indexer install

# ─── Repo-wide ────────────────────────────────────────────────────

# Install local git hooks (post-commit GitNexus re-indexer)
init:
    mkdir -p .git/hooks
    install -m 0755 infra/git/post-commit .git/hooks/post-commit
    @echo "Installed: .git/hooks/post-commit"

# Remove build artifacts (pnpm/TypeScript dist + SvelteKit output)
clean:
    rm -rf apps/*/dist apps/web/.svelte-kit apps/web/build

# Reinstall from scratch
fresh: clean install
