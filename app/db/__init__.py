"""Database connection pool management.

Usage:
    pool = await init_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT ...")
    await close_pool()
"""

from __future__ import annotations

import json

import asyncpg
from pgvector.asyncpg import register_vector

from app.config import settings

_pool: asyncpg.Pool | None = None


async def _init_connection(conn: asyncpg.Connection) -> None:
    """Register pgvector types and JSONB codec on each new connection."""
    await register_vector(conn)
    await conn.set_type_codec(
        "jsonb",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
        format="text",
    )


async def init_pool() -> asyncpg.Pool:
    """Create the global connection pool."""
    global _pool
    if _pool is not None:
        raise RuntimeError("Connection pool already initialized")
    _pool = await asyncpg.create_pool(
        dsn=settings.database_url,
        min_size=settings.db_pool_min_size,
        max_size=settings.db_pool_max_size,
        init=_init_connection,
    )
    return _pool


def get_pool() -> asyncpg.Pool:
    """Return the global connection pool."""
    if _pool is None:
        raise RuntimeError("Connection pool not initialized. Call init_pool() first.")
    return _pool


async def close_pool() -> None:
    """Close the global connection pool."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
