"""Initialize the nazu database schema.

Usage: python -m scripts.init_db

Idempotent — safe to run multiple times.
"""

from __future__ import annotations

import asyncio
import sys

import asyncpg
from pgvector.asyncpg import register_vector

sys.path.insert(0, ".")

from app.config import settings
from app.db.schema import apply_schema


async def main() -> None:
    safe_dsn = settings.database_url.split("@")[-1]
    print(f"Connecting to {safe_dsn}...")

    try:
        conn = await asyncpg.connect(dsn=settings.database_url)
    except Exception as e:
        print(f"Connection failed: {e}")
        sys.exit(1)

    try:
        await register_vector(conn)
        await apply_schema(conn)
        print("Schema applied successfully.")

        count = await conn.fetchval(
            "SELECT count(*) FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = 'items'"
        )
        print(f"items table: {'exists' if count == 1 else 'MISSING'}")

        indexes = await conn.fetch(
            "SELECT indexname FROM pg_indexes WHERE tablename = 'items'"
        )
        print(f"Indexes: {[r['indexname'] for r in indexes]}")
    except asyncpg.exceptions.UndefinedObjectError:
        print(
            "ERROR: pgvector extension not found.\n"
            "Install it: sudo apt install postgresql-17-pgvector\n"
            "Then restart PostgreSQL and re-run this script."
        )
        sys.exit(1)
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
