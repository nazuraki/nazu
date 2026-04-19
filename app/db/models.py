"""Data models and CRUD operations for tasks and kb_index tables.

All database operations use raw SQL via asyncpg.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel

from app.db import get_pool


# ─── Task Models ──────────────────────────────────────────────────


class TaskCreate(BaseModel):
    description: str
    due_date: date | None = None


class TaskUpdate(BaseModel):
    description: str | None = None
    status: str | None = None
    due_date: date | None = None


class Task(BaseModel):
    id: uuid.UUID
    description: str
    status: str
    due_date: date | None
    created_at: datetime
    updated_at: datetime


# ─── KbEntry Models ───────────────────────────────────────────────


class KbEntryCreate(BaseModel):
    type: str
    summary: str


class KbEntry(BaseModel):
    id: uuid.UUID
    type: str
    summary: str
    created_at: datetime


# ─── Task CRUD ────────────────────────────────────────────────────


async def create_task(task: TaskCreate) -> Task:
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO tasks (description, due_date)
            VALUES ($1, $2)
            RETURNING *
            """,
            task.description,
            task.due_date,
        )
    return Task(**dict(row))


async def get_task(task_id: uuid.UUID) -> Task | None:
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM tasks WHERE id = $1", task_id)
    return Task(**dict(row)) if row else None


async def update_task(task_id: uuid.UUID, update: TaskUpdate) -> Task | None:
    pool = get_pool()
    set_parts: list[str] = []
    params: list[Any] = []
    idx = 1

    if update.description is not None:
        set_parts.append(f"description = ${idx}")
        params.append(update.description)
        idx += 1

    if update.status is not None:
        set_parts.append(f"status = ${idx}")
        params.append(update.status)
        idx += 1

    if update.due_date is not None:
        set_parts.append(f"due_date = ${idx}")
        params.append(update.due_date)
        idx += 1

    if not set_parts:
        return await get_task(task_id)

    params.append(task_id)
    query = f"UPDATE tasks SET {', '.join(set_parts)} WHERE id = ${idx} RETURNING *"

    async with pool.acquire() as conn:
        row = await conn.fetchrow(query, *params)
    return Task(**dict(row)) if row else None


async def delete_task(task_id: uuid.UUID) -> bool:
    pool = get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM tasks WHERE id = $1", task_id)
    return result == "DELETE 1"


async def list_tasks(
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Task]:
    pool = get_pool()
    conditions: list[str] = []
    params: list[Any] = []
    idx = 1

    if status is not None:
        conditions.append(f"status = ${idx}")
        params.append(status)
        idx += 1

    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    params.extend([limit, offset])

    query = f"""
        SELECT * FROM tasks
        {where}
        ORDER BY created_at DESC
        LIMIT ${idx} OFFSET ${idx + 1}
    """

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
    return [Task(**dict(row)) for row in rows]


# ─── KbEntry CRUD ─────────────────────────────────────────────────


async def create_kb_entry(entry: KbEntryCreate) -> KbEntry:
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO kb_index (type, summary)
            VALUES ($1, $2)
            RETURNING *
            """,
            entry.type,
            entry.summary,
        )
    return KbEntry(**dict(row))


async def delete_kb_entry(entry_id: uuid.UUID) -> bool:
    pool = get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM kb_index WHERE id = $1", entry_id)
    return result == "DELETE 1"


async def list_kb_entries(
    type: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[KbEntry]:
    pool = get_pool()
    conditions: list[str] = []
    params: list[Any] = []
    idx = 1

    if type is not None:
        conditions.append(f"type = ${idx}")
        params.append(type)
        idx += 1

    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    params.extend([limit, offset])

    query = f"""
        SELECT * FROM kb_index
        {where}
        ORDER BY created_at DESC
        LIMIT ${idx} OFFSET ${idx + 1}
    """

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
    return [KbEntry(**dict(row)) for row in rows]
