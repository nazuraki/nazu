-- Graphiti temporal-graph recall (#53): map Graphiti episodes back to nazu
-- documents so graph search results (facts/edges) resolve to kb_index entries.
--
-- The episode body itself, the extracted entities, and the edges all live in
-- FalkorDB (the Graphiti graph) — Postgres only holds the join key. When recall
-- asks the graph for a query, each returned fact carries the uuids of the
-- episodes that mention it; we look those up here to surface the source
-- documents alongside the FTS hits. ON DELETE CASCADE keeps the mapping honest
-- when a document is removed (the graph episode is pruned out-of-band).
CREATE TABLE graph_episodes (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id  uuid        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    episode_uuid text        NOT NULL UNIQUE,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX graph_episodes_document_id  ON graph_episodes (document_id);
CREATE INDEX graph_episodes_episode_uuid ON graph_episodes (episode_uuid);
