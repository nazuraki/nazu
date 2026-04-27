-- Replaces the stub kb_index created in 001_init.sql with the full schema.
DROP TABLE IF EXISTS kb_index CASCADE;

CREATE TABLE kb_index (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id uuid        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    title       text        NOT NULL,
    excerpt     text,
    type        text        NOT NULL DEFAULT 'note',
    tags        text[]      NOT NULL DEFAULT '{}',
    word_count  int         NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX kb_index_tags_gin    ON kb_index USING GIN (tags);
CREATE INDEX kb_index_created_at  ON kb_index (created_at DESC);
CREATE INDEX kb_index_search      ON kb_index USING GIN (
    to_tsvector('english', title || ' ' || COALESCE(excerpt, ''))
);
