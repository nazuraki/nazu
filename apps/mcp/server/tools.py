"""MCP tool implementations for nazu.

Each function is registered as an MCP tool in server.py.
Three domains: tasks (Postgres), knowledge graph (Graphiti/FalkorDB), kb_index (Postgres).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from graphiti_core.nodes import EpisodeType

from db import models
from db.models import KbEntryCreate, TaskCreate, TaskUpdate
from server.graphiti import get_graphiti


# ─── Helpers ──────────────────────────────────────────────────────


def _format_task(task: models.Task) -> str:
    due = f"  due: {task.due_date}" if task.due_date else ""
    return (
        f"[{task.status.upper()}] `{task.id}`\n"
        f"  {task.description}{due}\n"
        f"  created: {task.created_at.date()}"
    )


def _format_kb_entry(entry: models.KbEntry) -> str:
    return (
        f"[{entry.type}] `{entry.id}`\n"
        f"  {entry.summary}\n"
        f"  added: {entry.created_at.date()}"
    )


# ─── Task Tools ───────────────────────────────────────────────────


async def add_task(
    description: str,
    due_date: str | None = None,
) -> str:
    """Create a new task.

    Args:
        description: What needs to be done.
        due_date: Optional due date in ISO format (e.g. 2025-12-31).
    """
    from datetime import date

    parsed_due = date.fromisoformat(due_date) if due_date else None
    task = await models.create_task(
        TaskCreate(description=description, due_date=parsed_due)
    )
    return f"Task created:\n{_format_task(task)}"


async def complete_task(id: str) -> str:
    """Mark a task as done.

    Args:
        id: The task's UUID.
    """
    task = await models.update_task(uuid.UUID(id), TaskUpdate(status="done"))
    if task is None:
        return f"Task not found: {id}"
    return f"Task completed:\n{_format_task(task)}"


async def list_tasks(status: str | None = None) -> str:
    """List tasks, optionally filtered by status.

    Args:
        status: Filter by status — 'pending' or 'done'. Omit for all tasks.
    """
    tasks = await models.list_tasks(status=status)
    if not tasks:
        return "No tasks found."
    parts = [f"{len(tasks)} task(s):\n"]
    parts.extend(_format_task(t) for t in tasks)
    return "\n\n".join(parts)


async def delete_task(id: str) -> str:
    """Permanently delete a task.

    Args:
        id: The task's UUID.
    """
    deleted = await models.delete_task(uuid.UUID(id))
    if not deleted:
        return f"Task not found: {id}"
    return f"Deleted task: {id}"


# ─── Knowledge Graph Tools ────────────────────────────────────────


async def remember(
    content: str,
    source_description: str,
    name: str | None = None,
) -> str:
    """Store a piece of knowledge in the graph.

    Use this to capture facts, observations, conversations, or any information
    worth preserving in long-term memory.

    Args:
        content: The knowledge to store.
        source_description: Where this came from (e.g. "user conversation", "web research").
        name: Optional short label for this episode.
    """
    g = get_graphiti()
    episode_name = name or f"episode_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    await g.add_episode(
        name=episode_name,
        episode_body=content,
        source=EpisodeType.text,
        source_description=source_description,
        reference_time=datetime.now(),
    )
    return f"Stored in knowledge graph: {episode_name}"


async def recall(query: str, limit: int = 10) -> str:
    """Search the knowledge graph for relevant facts.

    Args:
        query: Natural language query.
        limit: Maximum results to return (default 10).
    """
    g = get_graphiti()
    results = await g.search(query=query, num_results=limit)
    if not results:
        return "Nothing found in the knowledge graph."
    parts = [f"Found {len(results)} result(s):\n"]
    for i, edge in enumerate(results, 1):
        parts.append(f"{i}. {edge.fact}")
    return "\n\n".join(parts)


# ─── KB Index Tools ───────────────────────────────────────────────


async def add_index_entry(type: str, summary: str) -> str:
    """Add a curated entry to the knowledge base index.

    The index is selective — add entries for concepts, people, projects, or topics
    worth surfacing quickly. Not every graph node needs an entry here.

    Args:
        type: Entry type (e.g. concept, person, project, place, event).
        summary: One or two sentence description of what this entry represents.
    """
    entry = await models.create_kb_entry(KbEntryCreate(type=type, summary=summary))
    return f"Index entry added:\n{_format_kb_entry(entry)}"


async def list_index(type: str | None = None) -> str:
    """List knowledge base index entries.

    Args:
        type: Filter by entry type. Omit for all entries.
    """
    entries = await models.list_kb_entries(type=type)
    if not entries:
        return "No index entries found."
    parts = [f"{len(entries)} index entry/entries:\n"]
    parts.extend(_format_kb_entry(e) for e in entries)
    return "\n\n".join(parts)


async def delete_index_entry(id: str) -> str:
    """Remove an entry from the knowledge base index.

    Args:
        id: The entry's UUID.
    """
    deleted = await models.delete_kb_entry(uuid.UUID(id))
    if not deleted:
        return f"Index entry not found: {id}"
    return f"Deleted index entry: {id}"
