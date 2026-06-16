-- Recall quality (#51): full-text index document bodies on the raw-store layer.
--
-- Bodies live in MinIO, so SQL can't read them — the ingest pipeline precomputes
-- a tsvector at write time and stores it here (lexemes only; the raw body stays
-- canonical in MinIO). This keeps `kb_index` lean (it remains the terse
-- topic/keyword bootstrap index loaded as agent context); detailed body recall
-- lives on `documents` instead, alongside processing-state tracking.
--
-- Both columns are nullable: a document can be stored unprocessed (NULL) and
-- indexed later — the storage-vs-processing seam. `indexed_at` records when the
-- body was processed into FTS (NULL = not yet).
ALTER TABLE documents
    ADD COLUMN body_search tsvector,
    ADD COLUMN indexed_at  timestamptz;

CREATE INDEX documents_body_search ON documents USING GIN (body_search);
