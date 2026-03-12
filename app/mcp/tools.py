"""MCP tool implementations for nazu.

Each function is registered as an MCP tool in server.py.
Tools are thin: generate embeddings, call CRUD, format responses.
"""

from __future__ import annotations

import uuid
from typing import Any

from app.db import models
from app.db.models import ItemCreate, ItemUpdate
from app.mcp.embeddings import generate_embedding


CONFIDENCE_THRESHOLD = 0.7


# ─── Helpers ──────────────────────────────────────────────────────


def _format_item(item: models.Item) -> str:
    lines = [
        f"**{item.type.upper()}** `{item.id}`",
        f"Content: {item.content}",
    ]
    if item.metadata:
        for key, value in item.metadata.items():
            lines.append(f"  {key}: {value}")
    lines.append(f"Created: {item.created_at.isoformat()}")
    lines.append(f"Updated: {item.updated_at.isoformat()}")
    return "\n".join(lines)


def _format_search_result(result: models.SearchResult, rank: int) -> str:
    return (
        f"{rank}. [distance: {result.distance:.4f}]\n"
        f"{_format_item(result.item)}"
    )


# ─── Tools ────────────────────────────────────────────────────────


async def add_item(
    type: str,
    content: str,
    topics: list[str],
    classification_confidence: float | None = None,
    metadata: dict[str, Any] | None = None,
) -> str:
    """Create a new item with an auto-generated embedding.

    Args:
        type: Item type (note, task, url, transcript).
        content: The text content of the item.
        topics: Semantic domain topics in kebab-case (e.g. ["home-automation", "finance"]).
            Provide your best classification. Pass [] if genuinely unclassifiable.
        classification_confidence: Confidence in topic classification (0.0–1.0).
            Items with confidence below 0.7 or empty topics are auto-flagged for review.
        metadata: Optional metadata dict (tags, status, due_date, etc.).
    """
    meta = metadata or {}
    meta["topics"] = topics
    if classification_confidence is not None:
        meta["classification_confidence"] = classification_confidence

    needs_review = (not topics) or (
        classification_confidence is not None
        and classification_confidence < CONFIDENCE_THRESHOLD
    )
    if needs_review:
        meta["needs_review"] = True

    embedding = await generate_embedding(content)
    item_data = ItemCreate(type=type, content=content, metadata=meta)
    item = await models.create_item(item_data, embedding=embedding)
    return f"Created item:\n{_format_item(item)}"


async def search(
    query: str,
    limit: int = 10,
    type: str | None = None,
    tag: str | None = None,
    topic: str | None = None,
    needs_review: bool | None = None,
) -> str:
    """Search items by semantic similarity.

    Args:
        query: Natural language search query.
        limit: Maximum results to return (default 10).
        type: Filter by item type.
        tag: Filter by tag.
        topic: Filter by semantic topic (e.g. "home-automation", "finance").
        needs_review: If True, restrict to items flagged for review.
    """
    query_embedding = await generate_embedding(query)
    results = await models.search_items(
        query_embedding=query_embedding,
        limit=limit,
        type=type,
        tag=tag,
        topic=topic,
        needs_review=needs_review,
    )
    if not results:
        return "No matching items found."
    parts = [f"Found {len(results)} result(s):\n"]
    for i, result in enumerate(results, 1):
        parts.append(_format_search_result(result, i))
    return "\n\n".join(parts)


async def get_item(id: str) -> str:
    """Fetch a single item by its UUID.

    Args:
        id: The item's UUID.
    """
    item = await models.get_item(uuid.UUID(id))
    if item is None:
        return f"Item not found: {id}"
    return _format_item(item)


async def list_items(
    type: str | None = None,
    tag: str | None = None,
    status: str | None = None,
    topic: str | None = None,
    needs_review: bool | None = None,
    limit: int = 50,
    offset: int = 0,
) -> str:
    """List items with optional filters.

    Args:
        type: Filter by item type (note, task, url, transcript).
        tag: Filter by tag.
        status: Filter by metadata status (e.g. pending, done).
        topic: Filter by semantic topic (e.g. "home-automation", "finance").
        needs_review: If True, restrict to items flagged for classification review.
        limit: Maximum items to return (default 50).
        offset: Pagination offset (default 0).
    """
    items = await models.list_items(
        type=type,
        tag=tag,
        status=status,
        topic=topic,
        needs_review=needs_review,
        limit=limit,
        offset=offset,
    )
    if not items:
        return "No items found."
    parts = [f"Showing {len(items)} item(s):\n"]
    for item in items:
        parts.append(_format_item(item))
    return "\n\n".join(parts)


async def update_item(
    id: str,
    content: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> str:
    """Update an existing item's content and/or metadata.

    Regenerates the embedding if content changes.

    Args:
        id: The item's UUID.
        content: New content text (triggers embedding regeneration).
        metadata: New metadata dict (replaces existing metadata entirely).
    """
    embedding = None
    if content is not None:
        embedding = await generate_embedding(content)
    update_data = ItemUpdate(content=content, metadata=metadata)
    item = await models.update_item(uuid.UUID(id), update_data, embedding=embedding)
    if item is None:
        return f"Item not found: {id}"
    return f"Updated item:\n{_format_item(item)}"


async def add_task(
    content: str,
    topics: list[str],
    due_date: str | None = None,
    tags: list[str] | None = None,
    classification_confidence: float | None = None,
) -> str:
    """Shortcut to create a task item.

    Args:
        content: Task description.
        topics: Semantic domain topics in kebab-case (e.g. ["home-automation"]).
            Pass [] if genuinely unclassifiable — item will be flagged for review.
        due_date: Optional due date (ISO format, e.g. 2025-12-31).
        tags: Optional list of tags.
        classification_confidence: Confidence in topic classification (0.0–1.0).
    """
    metadata: dict[str, Any] = {"status": "pending"}
    if due_date is not None:
        metadata["due_date"] = due_date
    if tags is not None:
        metadata["tags"] = tags
    return await add_item(
        type="task",
        content=content,
        topics=topics,
        classification_confidence=classification_confidence,
        metadata=metadata,
    )


async def review_items(limit: int = 20) -> str:
    """List items flagged as needing classification review.

    These are items stored with low classification confidence. For each,
    inspect the assigned topics, correct them if needed via update_item,
    then clear the flag by setting needs_review to False in metadata.

    Args:
        limit: Maximum items to return (default 20).
    """
    items = await models.list_items(needs_review=True, limit=limit)
    if not items:
        return "No items pending review."
    parts = [f"{len(items)} item(s) need review:\n"]
    for item in items:
        parts.append(_format_item(item))
    return "\n\n".join(parts)


async def delete_item(id: str) -> str:
    """Permanently delete an item by its UUID.

    Args:
        id: The item's UUID.
    """
    deleted = await models.delete_item(uuid.UUID(id))
    if not deleted:
        return f"Item not found: {id}"
    return f"Deleted item: {id}"


async def complete_task(id: str) -> str:
    """Mark a task as done.

    Args:
        id: The task item's UUID.
    """
    item_id = uuid.UUID(id)
    existing = await models.get_item(item_id)
    if existing is None:
        return f"Task not found: {id}"
    if existing.type != "task":
        return f"Item {id} is a {existing.type}, not a task."
    updated_metadata = {**existing.metadata, "status": "done"}
    update_data = ItemUpdate(metadata=updated_metadata)
    item = await models.update_item(item_id, update_data)
    if item is None:
        return f"Failed to update task: {id}"
    return f"Task completed:\n{_format_item(item)}"
