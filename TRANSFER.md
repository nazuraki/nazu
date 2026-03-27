# nazu — Data Transfer Guide

## What's in the dump

`nazu_backup_YYYYMMDD_HHMMSS.sql` is a plain-SQL pg_dump containing:
- Schema: `items` table, indexes, triggers, pgvector extension
- Data: all items (notes, tasks, urls, transcripts) with embeddings

Generated with:
```bash
PGPASSWORD=nazu pg_dump -U nazu -h localhost -d nazu -F p --no-owner --no-acl -f nazu_backup_$(date +%Y%m%d_%H%M%S).sql
```

---

## Prerequisites on the target server

1. **PostgreSQL 14+** installed and running
2. **pgvector extension** installed:
   ```bash
   # Debian/Ubuntu
   sudo apt install postgresql-16-pgvector
   ```
3. **Python 3.12+** and Docker (if running the app containerized)

---

## Import steps

### 1. Create the database and user

```sql
-- Run as postgres superuser
CREATE USER nazu WITH PASSWORD 'nazu';
CREATE DATABASE nazu OWNER nazu;
\c nazu
CREATE EXTENSION IF NOT EXISTS vector;
```

Or via shell:
```bash
sudo -u postgres psql -c "CREATE USER nazu WITH PASSWORD 'nazu';"
sudo -u postgres psql -c "CREATE DATABASE nazu OWNER nazu;"
sudo -u postgres psql -d nazu -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### 2. Import the dump

```bash
PGPASSWORD=nazu psql -U nazu -h localhost -d nazu -f nazu_backup_20260327_144646.sql
```

### 3. Verify

```bash
PGPASSWORD=nazu psql -U nazu -h localhost -d nazu -c "SELECT type, count(*) FROM items GROUP BY type;"
```

---

## Set up the app

### 1. Copy `.env`

Copy `.env` from this repo to the server (it contains the OpenAI API key for embeddings). Update `DATABASE_URL` if the host/credentials differ.

### 2. Run the MCP server

```bash
python -m app.mcp.server
```

Or via Docker Compose once configured.

---

## Notes

- The dump uses `--no-owner --no-acl` so it's portable — no hardcoded OS user ownership.
- Embeddings are stored in the dump (vector columns included), so no re-indexing is needed after import.
- If you change the DB password on the target, update `DATABASE_URL` in `.env` accordingly.
