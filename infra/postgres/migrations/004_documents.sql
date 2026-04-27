CREATE TABLE documents (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    storage_key text        NOT NULL,
    content_type text       NOT NULL DEFAULT 'text/markdown',
    filename    text        NOT NULL,
    source_url  text,
    author      text,
    ingested_at timestamptz NOT NULL DEFAULT now()
);
