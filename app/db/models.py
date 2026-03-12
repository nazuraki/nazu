"""Data models and CRUD operations for the items table.

All database operations use raw SQL via asyncpg.
Embedding generation is handled upstream (MCP tools layer).
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any

import asyncpg
import numpy as np
from pydantic import BaseModel, Field

from app.db import get_pool


# ─── Models ───────────────────────────────────────────────────────


class ItemCreate(BaseModel):
    type: str
    content: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class ItemUpdate(BaseModel):
    content: str | None = None
    metadata: dict[str, Any] | None = None


class Item(BaseModel):
    id: uuid.UUID
    type: str
    content: str
    metadata: dict[str, Any]
    embedding: list[float] | None = None
    created_at: datetime
    updated_at: datetime


class SearchResult(BaseModel):
    item: Item
    distance: float


# ─── Helpers ──────────────────────────────────────────────────────


def _record_to_item(record: asyncpg.Record) -> Item:
    data = dict(record)
    if data.get("embedding") is not None:
        data["embedding"] = data["embedding"].tolist()
    if isinstance(data.get("metadata"), str):
        data["metadata"] = json.loads(data["metadata"])
    return Item(**data)


# ─── CRUD ─────────────────────────────────────────────────────────


async def create_item(
    item: ItemCreate,
    embedding: np.ndarray | None = None,
) -> Item:
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO items (type, content, metadata, embedding)
            VALUES ($1, $2, $3::jsonb, $4)
            RETURNING *
            """,
            item.type,
            item.content,
            json.dumps(item.metadata),
            embedding,
        )
    return _record_to_item(row)


async def get_item(item_id: uuid.UUID) -> Item | None:
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM items WHERE id = $1", item_id)
    if row is None:
        return None
    return _record_to_item(row)


async def update_item(
    item_id: uuid.UUID,
    update: ItemUpdate,
    embedding: np.ndarray | None = None,
) -> Item | None:
    pool = get_pool()
    set_parts: list[str] = []
    params: list[Any] = []
    idx = 1

    if update.content is not None:
        set_parts.append(f"content = ${idx}")
        params.append(update.content)
        idx += 1

    if update.metadata is not None:
        set_parts.append(f"metadata = ${idx}::jsonb")
        params.append(json.dumps(update.metadata))
        idx += 1

    if embedding is not None:
        set_parts.append(f"embedding = ${idx}")
        params.append(embedding)
        idx += 1

    if not set_parts:
        return await get_item(item_id)

    params.append(item_id)
    query = f"UPDATE items SET {', '.join(set_parts)} WHERE id = ${idx} RETURNING *"

    async with pool.acquire() as conn:
        row = await conn.fetchrow(query, *params)
    if row is None:
        return None
    return _record_to_item(row)


async def delete_item(item_id: uuid.UUID) -> bool:
    pool = get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM items WHERE id = $1", item_id)
    return result == "DELETE 1"


async def list_items(
    type: str | None = None,
    tag: str | None = None,
    status: str | None = None,
    topic: str | None = None,
    needs_review: bool | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Item]:
    pool = get_pool()
    conditions: list[str] = []
    params: list[Any] = []
    idx = 1

    if type is not None:
        conditions.append(f"type = ${idx}")
        params.append(type)
        idx += 1

    if tag is not None:
        conditions.append(f"metadata->'tags' ? ${idx}")
        params.append(tag)
        idx += 1

    if status is not None:
        conditions.append(f"metadata->>'status' = ${idx}")
        params.append(status)
        idx += 1

    if topic is not None:
        conditions.append(f"metadata->'topics' ? ${idx}")
        params.append(topic)
        idx += 1

    if needs_review is not None:
        conditions.append(f"metadata @> ${idx}::jsonb")
        params.append(json.dumps({"needs_review": needs_review}))
        idx += 1

    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    params.extend([limit, offset])

    query = f"""
        SELECT * FROM items
        {where}
        ORDER BY created_at DESC
        LIMIT ${idx} OFFSET ${idx + 1}
    """

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
    return [_record_to_item(row) for row in rows]


async def search_items(
    query_embedding: np.ndarray,
    limit: int = 10,
    type: str | None = None,
    tag: str | None = None,
    topic: str | None = None,
    needs_review: bool | None = None,
) -> list[SearchResult]:
    pool = get_pool()
    conditions: list[str] = ["embedding IS NOT NULL"]
    params: list[Any] = [query_embedding]
    idx = 2

    if type is not None:
        conditions.append(f"type = ${idx}")
        params.append(type)
        idx += 1

    if tag is not None:
        conditions.append(f"metadata->'tags' ? ${idx}")
        params.append(tag)
        idx += 1

    if topic is not None:
        conditions.append(f"metadata->'topics' ? ${idx}")
        params.append(topic)
        idx += 1

    if needs_review is not None:
        conditions.append(f"metadata @> ${idx}::jsonb")
        params.append(json.dumps({"needs_review": needs_review}))
        idx += 1

    where = "WHERE " + " AND ".join(conditions)
    params.append(limit)

    query = f"""
        SELECT *, embedding <=> $1 AS distance
        FROM items
        {where}
        ORDER BY embedding <=> $1
        LIMIT ${idx}
    """

    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *params)

    results = []
    for row in rows:
        data = dict(row)
        distance = data.pop("distance")
        if data.get("embedding") is not None:
            data["embedding"] = data["embedding"].tolist()
        if isinstance(data.get("metadata"), str):
            data["metadata"] = json.loads(data["metadata"])
        results.append(SearchResult(item=Item(**data), distance=distance))
    return results
