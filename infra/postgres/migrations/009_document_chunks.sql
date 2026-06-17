-- Document chunking (#25): split an ingested body into passage-sized chunks so
-- recall can rank and surface the matching *section* of a long document instead
-- of treating the whole body as one tsvector (migration 008).
--
-- Each chunk carries its own FTS vector. Chunk *text* is kept here in Postgres —
-- chunks are small, bounded, derived artifacts, so storing them lets `ts_headline`
-- extract a snippet without a MinIO round-trip per query. The canonical raw body
-- still lives in MinIO; `document_chunks` is a derived search layer, like
-- `documents.body_search`. It is also the natural unit a future embedding column
-- attaches to (semantic recall, #53).
--
-- `body_search` is nullable to mirror the storage-vs-processing seam in 008: a
-- chunk row can exist before its vector is computed.
CREATE TABLE document_chunks (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id uuid        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index int         NOT NULL,
    content     text        NOT NULL,
    word_count  int         NOT NULL DEFAULT 0,
    body_search tsvector,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (document_id, chunk_index)
);

CREATE INDEX document_chunks_document_id ON document_chunks (document_id);
CREATE INDEX document_chunks_search      ON document_chunks USING GIN (body_search);
