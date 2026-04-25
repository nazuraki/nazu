"""Database schema definitions for nazu.

All DDL statements are plain SQL strings.
apply_schema() executes them in order against a connection.
"""

from __future__ import annotations

CREATE_TASKS_TABLE = """
CREATE TABLE IF NOT EXISTS tasks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    description TEXT NOT NULL,
    status      VARCHAR(20) NOT NULL DEFAULT 'pending',
    due_date    DATE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""

CREATE_KB_INDEX_TABLE = """
CREATE TABLE IF NOT EXISTS kb_index (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type        VARCHAR(50) NOT NULL,
    summary     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""

CREATE_TASKS_STATUS_INDEX = """
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
"""

CREATE_TASKS_CREATED_AT_INDEX = """
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks (created_at DESC);
"""

CREATE_KB_INDEX_TYPE_INDEX = """
CREATE INDEX IF NOT EXISTS idx_kb_index_type ON kb_index (type);
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

CREATE_TASKS_UPDATED_AT_TRIGGER = """
DROP TRIGGER IF EXISTS trigger_tasks_updated_at ON tasks;
CREATE TRIGGER trigger_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
"""

ALL_STATEMENTS = [
    CREATE_TASKS_TABLE,
    CREATE_KB_INDEX_TABLE,
    CREATE_TASKS_STATUS_INDEX,
    CREATE_TASKS_CREATED_AT_INDEX,
    CREATE_KB_INDEX_TYPE_INDEX,
    CREATE_UPDATED_AT_FUNCTION,
    CREATE_TASKS_UPDATED_AT_TRIGGER,
]


async def apply_schema(conn) -> None:
    """Execute all DDL statements in order."""
    for statement in ALL_STATEMENTS:
        await conn.execute(statement)
