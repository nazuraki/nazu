# Purpose

## Problem

Personal knowledge accumulates across conversations, research sessions, and daily tasks — and then disappears. AI assistants are stateless by default: each session starts from zero, and anything learned or decided is gone the moment the context window closes. There is no durable place for an AI agent to store what it knows, what it has been told, or what it has figured out on your behalf.

nazu is a self-hosted memory and task layer for AI agents. It exposes an MCP interface so that Claude (or any MCP-capable agent) can read and write structured knowledge: store facts and observations in a temporal knowledge graph, manage tasks with clear status, and maintain a curated index of concepts and entities worth surfacing quickly. Agents interact with nazu the same way they interact with any tool — by calling named functions — and nazu persists the results across sessions.

The graph layer (FalkorDB via Graphiti) captures the richness and relationships of unstructured knowledge. The relational layer (PostgreSQL) holds well-typed records that are fast to query without graph traversal. The two layers are deliberately separate: structured data for structured queries, graph data for everything else.

## Non-Goals

- **Not a general-purpose note-taking app.** nazu has no UI and is not designed for human direct use. It is an agent-facing API.
- **Not a replacement for a calendar or task manager.** Tasks in nazu are simple (description + status). Anything requiring scheduling, reminders, or collaboration belongs in a dedicated tool.
- **Not a document store.** nazu stores summaries, facts, and index entries — not full documents, attachments, or raw files.
- **Not multi-user.** nazu is a personal system. There is no authentication model for multiple users or shared workspaces.
- **Not an inference layer.** nazu stores and retrieves data. It does not call LLMs to reason about that data — that is the agent's job.

## Intended Users

One person: the owner of the instance. nazu is self-hosted by design, running on personal hardware with access restricted to the owner's AI agents via MCP.
