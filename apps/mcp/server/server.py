"""MCP server entry point for nazu.

Run with: python -m server.server
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from mcp.server.fastmcp import FastMCP

from db import close_pool, init_pool
from server import tools
from server.graphiti import close_graphiti, init_graphiti


@asynccontextmanager
async def app_lifespan(server: FastMCP) -> AsyncIterator[None]:
    await init_pool()
    await init_graphiti()
    try:
        yield
    finally:
        await close_graphiti()
        await close_pool()


mcp = FastMCP("nazu", lifespan=app_lifespan)

# ─── Task tools ──────────────────────────────────────────────────

mcp.tool()(tools.add_task)
mcp.tool()(tools.complete_task)
mcp.tool()(tools.list_tasks)
mcp.tool()(tools.delete_task)

# ─── Knowledge graph tools ───────────────────────────────────────

mcp.tool()(tools.remember)
mcp.tool()(tools.recall)

# ─── KB index tools ──────────────────────────────────────────────

mcp.tool()(tools.add_index_entry)
mcp.tool()(tools.list_index)
mcp.tool()(tools.delete_index_entry)


if __name__ == "__main__":
    mcp.run(transport="stdio")
