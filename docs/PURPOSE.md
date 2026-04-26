# Purpose

## Problem

Personal knowledge accumulates across conversations, research sessions, and daily tasks — and then disappears. AI assistants are stateless by default: each session starts from zero, and anything learned or decided is gone the moment the context window closes. There is no durable place for an AI agent to store what it knows, what it has been told, or what it has figured out on your behalf.

nazu is a self-hosted personal knowledge system and home dashboard. It stores facts, observations, and relationships in a temporal knowledge graph, maintains a curated index of concepts and entities worth surfacing quickly, and surfaces live engineering context (GitHub activity, CI status, running containers) in a single web interface.

The graph layer (FalkorDB via Graphiti) captures the richness and relationships of unstructured knowledge. The relational layer (PostgreSQL) holds well-typed records that are fast to query without graph traversal. The two layers are deliberately separate: structured data for structured queries, graph data for everything else.

## Non-Goals

- **Not multi-user.** nazu is a personal system. There is no authentication model for multiple users or shared workspaces.

## Intended Users

One person: the owner of the instance. nazu is self-hosted by design, running on personal hardware with access restricted to the owner's AI agents via MCP.
