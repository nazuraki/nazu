-- usr: users, app-scoped roles, permissions, sessions, DB-backed settings.

CREATE TABLE app_settings (
  section TEXT NOT NULL,
  key     TEXT NOT NULL,
  value   TEXT NOT NULL,
  PRIMARY KEY (section, key)
);

CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT,
  display_name  TEXT,
  avatar_url    TEXT,
  timezone      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

-- Browser sessions: user_id for real users, username for the local admin
-- account (which has no users row).
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    BIGINT REFERENCES users (id) ON DELETE CASCADE,
  username   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  CHECK (user_id IS NOT NULL OR username IS NOT NULL)
);

-- Apps are string namespaces (e.g. 'nazu', 'backplane', 'usr'); roles are
-- named per app and carry a set of free-form permission strings.
CREATE TABLE roles (
  id          BIGSERIAL PRIMARY KEY,
  app         TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (app, name)
);

CREATE TABLE role_permissions (
  role_id    BIGINT NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  PRIMARY KEY (role_id, permission)
);

CREATE TABLE user_roles (
  user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role_id BIGINT NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

-- usr's own admin gate: holders of usr/admin manage users, roles and settings.
INSERT INTO roles (app, name, description) VALUES ('usr', 'admin', 'usr administrators');
INSERT INTO role_permissions (role_id, permission)
  SELECT id, 'admin' FROM roles WHERE app = 'usr' AND name = 'admin';
