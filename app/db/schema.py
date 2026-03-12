"""Database schema definitions for nazu.

All DDL statements are plain SQL strings.
apply_schema() executes them in order against a connection.
"""

from __future__ import annotations

ENABLE_PGVECTOR = "CREATE EXTENSION IF NOT EXISTS vector;"

CREATE_ITEMS_TABLE = """
CREATE TABLE IF NOT EXISTS items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type        VARCHAR(50) NOT NULL,
    content     TEXT NOT NULL,
    metadata    JSONB NOT NULL DEFAULT '{}',
    embedding   vector(1536),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""

CREATE_TYPE_INDEX = """
CREATE INDEX IF NOT EXISTS idx_items_type ON items (type);
"""

CREATE_METADATA_GIN_INDEX = """
CREATE INDEX IF NOT EXISTS idx_items_metadata ON items USING gin (metadata);
"""

CREATE_EMBEDDING_HNSW_INDEX = """
CREATE INDEX IF NOT EXISTS idx_items_embedding ON items
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
"""

CREATE_CREATED_AT_INDEX = """
CREATE INDEX IF NOT EXISTS idx_items_created_at ON items (created_at DESC);
"""

CREATE_UPDATED_AT_FUNCTION = """
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
"""

CREATE_UPDATED_AT_TRIGGER = """
DROP TRIGGER IF EXISTS trigger_items_updated_at ON items;
CREATE TRIGGER trigger_items_updated_at
    BEFORE UPDATE ON items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
"""

ALL_STATEMENTS = [
    ENABLE_PGVECTOR,
    CREATE_ITEMS_TABLE,
    CREATE_TYPE_INDEX,
    CREATE_METADATA_GIN_INDEX,
    CREATE_EMBEDDING_HNSW_INDEX,
    CREATE_CREATED_AT_INDEX,
    CREATE_UPDATED_AT_FUNCTION,
    CREATE_UPDATED_AT_TRIGGER,
]


async def apply_schema(conn) -> None:
    """Execute all DDL statements in order."""
    for statement in ALL_STATEMENTS:
        await conn.execute(statement)
