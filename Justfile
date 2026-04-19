# nazu — personal knowledge MCP server
# Requires: just, python3.14 (homebrew), docker, ruff

default:
    @just --list

# Create .venv and install dependencies
install:
    /opt/homebrew/bin/python3.14 -m venv .venv
    .venv/bin/pip install -r requirements.txt -r requirements-dev.txt

# Run the MCP server (stdio transport)
run:
    .venv/bin/python -m app.mcp.server

# Run all checks
check: lint

# Lint
lint:
    .venv/bin/ruff check .

# Fix lint and formatting issues
fix:
    .venv/bin/ruff check . --fix
    .venv/bin/ruff format .

# Initialize the Postgres schema
db-init:
    .venv/bin/python -m scripts.init_db

# Start FalkorDB in the background
up:
    docker compose up -d falkordb

# Stop FalkorDB
down:
    docker compose down

# Remove venv and caches
clean:
    rm -rf .venv
    find . -name '__pycache__' -type d | xargs rm -rf

# Reinstall from scratch
fresh: clean install
