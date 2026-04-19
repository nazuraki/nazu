"""Initialize the nazu database schema.

Usage: python -m scripts.init_db

Idempotent — safe to run multiple times.
"""

from __future__ import annotations

import asyncio
import sys

import asyncpg

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
        await apply_schema(conn)
        print("Schema applied successfully.")

        for table in ("tasks", "kb_index"):
            count = await conn.fetchval(
                "SELECT count(*) FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_name = $1",
                table,
            )
            print(f"{table}: {'exists' if count == 1 else 'MISSING'}")

        indexes = await conn.fetch(
            "SELECT tablename, indexname FROM pg_indexes "
            "WHERE tablename IN ('tasks', 'kb_index') ORDER BY tablename, indexname"
        )
        for row in indexes:
            print(f"  {row['tablename']}: {row['indexname']}")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
