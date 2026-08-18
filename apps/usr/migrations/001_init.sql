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

-- Browser sessions — every session (OAuth or local-credential login) belongs
-- to a users row; tokens are stored hashed.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
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

-- Machine identities: API keys are role-mapped exactly like users (no env
-- key, no implicit root). Tokens are stored hashed and shown once on create.
CREATE TABLE api_keys (
  id           BIGSERIAL PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  key_hash     TEXT NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE TABLE api_key_roles (
  key_id  BIGINT NOT NULL REFERENCES api_keys (id) ON DELETE CASCADE,
  role_id BIGINT NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  PRIMARY KEY (key_id, role_id)
);

-- usr's own admin gate. Authorization is per-action: routes require
-- users:read/users:write, roles:read/roles:write, settings:read/settings:write
-- in the `usr` app; `admin` is the grantable umbrella satisfying all of them.
INSERT INTO roles (app, name, description) VALUES ('usr', 'admin', 'usr administrators');
INSERT INTO role_permissions (role_id, permission)
  SELECT id, 'admin' FROM roles WHERE app = 'usr' AND name = 'admin';

-- Default role for app/service API keys: may query the permissions hot path.
INSERT INTO roles (app, name, description)
  VALUES ('usr', 'service', 'service accounts — may query permissions');
INSERT INTO role_permissions (role_id, permission)
  SELECT id, 'permissions:read' FROM roles WHERE app = 'usr' AND name = 'service';
