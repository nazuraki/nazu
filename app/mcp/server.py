"""MCP server entry point for nazu.

Run with: python -m app.mcp.server
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from mcp.server.fastmcp import FastMCP

from app.db import close_pool, init_pool
from app.mcp import tools


@asynccontextmanager
async def app_lifespan(server: FastMCP) -> AsyncIterator[None]:
    """Initialize the database pool on startup, close on shutdown."""
    await init_pool()
    try:
        yield
    finally:
        await close_pool()


mcp = FastMCP("nazu", lifespan=app_lifespan)

# ─── Register tools ──────────────────────────────────────────────

mcp.tool()(tools.add_item)
mcp.tool()(tools.search)
mcp.tool()(tools.get_item)
mcp.tool()(tools.list_items)
mcp.tool()(tools.update_item)
mcp.tool()(tools.delete_item)
mcp.tool()(tools.add_task)
mcp.tool()(tools.complete_task)
mcp.tool()(tools.review_items)


if __name__ == "__main__":
    mcp.run(transport="stdio")
