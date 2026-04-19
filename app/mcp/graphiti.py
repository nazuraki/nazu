"""Graphiti client singleton management."""

from __future__ import annotations

from graphiti_core import Graphiti

from app.config import settings

_graphiti: Graphiti | None = None


async def init_graphiti() -> Graphiti:
    global _graphiti
    if _graphiti is not None:
        raise RuntimeError("Graphiti already initialized")
    _graphiti = Graphiti(
        uri=settings.falkordb_uri,
        user=settings.falkordb_user,
        password=settings.falkordb_password,
    )
    await _graphiti.build_indices_and_constraints()
    return _graphiti


def get_graphiti() -> Graphiti:
    if _graphiti is None:
        raise RuntimeError("Graphiti not initialized. Call init_graphiti() first.")
    return _graphiti


async def close_graphiti() -> None:
    global _graphiti
    if _graphiti is not None:
        await _graphiti.close()
        _graphiti = None
