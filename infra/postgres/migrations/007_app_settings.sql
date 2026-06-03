-- DB-backed application settings: the single source of truth for all
-- user-editable configuration (feature toggles + integration config). One row
-- per logical section; the value is a typed JSON document validated in the app
-- layer against the schema in apps/web/src/lib/config/settings.ts.
--
-- Living in Postgres means config persists in the postgres_data volume and is
-- therefore independent of where `docker compose` was launched from. No row is
-- seeded: a fresh install starts unconfigured (zero-conf) and is set up via the
-- in-app /settings UI.
CREATE TABLE app_settings (
    section    text        PRIMARY KEY,   -- 'features', 'github', 'oauth', ...
    config     jsonb       NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);
