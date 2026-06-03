-- Persisted enable/disable intent for optional, UI-toggleable services.
-- Live container state comes from Docker; this records what the user *wants*
-- enabled so the UI can reconcile and so a `compose down` can be recovered.
CREATE TABLE service_config (
    profile    text        PRIMARY KEY,          -- compose profile, e.g. 'tunnel', 'tls'
    enabled    boolean     NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO service_config (profile, enabled) VALUES
    ('tunnel', false),
    ('tls', false);
