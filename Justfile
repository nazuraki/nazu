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

check: typecheck lint test-unit

# Run exactly what CI runs (.github/workflows/ci.yml): lint + typecheck + unit +
# functional. Needs Docker for the functional stack. Use `check` for the fast
# inner loop; use this before pushing to mirror CI.
ci: lint typecheck test-unit test-functional

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
