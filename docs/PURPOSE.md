# Purpose

## Problem

Personal knowledge accumulates across conversations, research sessions, and daily tasks — and then disappears. AI assistants are stateless by default: each session starts from zero, and anything learned or decided is gone the moment the context window closes. There is no durable place for an AI agent to store what it knows, what it has been told, or what it has figured out on your behalf.

nazu is a self-hosted personal knowledge system and home dashboard. Today it stores curated records and documents in PostgreSQL (full-text search) and MinIO, exposes a **remember / recall** loop to AI agents over REST and the Memory MCP, and surfaces live engineering context (GitHub activity, CI status, running containers) in a single web interface.

The long-term design adds a **graph layer** (FalkorDB via Graphiti) to capture the richness and relationships of unstructured knowledge in a temporal knowledge graph, alongside the relational layer (PostgreSQL) for well-typed records that are fast to query without graph traversal — structured data for structured queries, graph data for everything else.

> **Status:** the relational + object layers and the Memory MCP are built and in use. The Graphiti temporal knowledge graph is now **partially implemented** (issue #53, [ADR 0001](adr/0001-graphiti-temporal-recall.md)): a thin FastAPI sidecar (`apps/graphiti/`) over `graphiti-core` indexes ingested documents into a `nazu_knowledge` graph in FalkorDB and augments FTS recall with graph hits. It is **off by default** and gated behind a `graph` setting. Blended ranking, background extraction, and document backfill are follow-ups.

## Non-Goals

- **Not multi-user.** nazu is a personal system. There is no authentication model for multiple users or shared workspaces.

## Intended Users

One person: the owner of the instance. nazu is self-hosted by design, running on personal hardware with access restricted to the owner's AI agents via MCP.
