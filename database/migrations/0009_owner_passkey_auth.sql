-- One permanent owner may enroll multiple passkeys. Raw challenges, browser nonces and session
-- tokens never enter PostgreSQL; the server persists keyed hashes only.
CREATE TYPE admin_webauthn_ceremony AS ENUM ('bootstrap_registration', 'add_credential', 'authentication', 'reauthentication');

CREATE TABLE admin_owner (
  singleton_id SMALLINT PRIMARY KEY CHECK (singleton_id = 1),
  webauthn_user_handle BYTEA NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE admin_passkey_credentials (
  credential_id BYTEA PRIMARY KEY,
  owner_singleton_id SMALLINT NOT NULL REFERENCES admin_owner(singleton_id) ON DELETE CASCADE,
  public_key BYTEA NOT NULL,
  sign_count BIGINT NOT NULL DEFAULT 0 CHECK (sign_count >= 0),
  transports TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  device_type TEXT NOT NULL CHECK (device_type IN ('singleDevice', 'multiDevice')),
  backed_up BOOLEAN NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  deactivated_at TIMESTAMPTZ,
  CHECK ((active AND deactivated_at IS NULL) OR (NOT active AND deactivated_at IS NOT NULL))
);

CREATE INDEX admin_passkey_credentials_owner_active_idx
  ON admin_passkey_credentials (owner_singleton_id, created_at)
  WHERE active;

CREATE TABLE admin_webauthn_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_singleton_id SMALLINT REFERENCES admin_owner(singleton_id) ON DELETE CASCADE,
  challenge_hash TEXT NOT NULL UNIQUE,
  browser_nonce_hash TEXT NOT NULL,
  ceremony admin_webauthn_ceremony NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE INDEX admin_webauthn_challenges_expiry_idx
  ON admin_webauthn_challenges (expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY,
  owner_singleton_id SMALLINT NOT NULL REFERENCES admin_owner(singleton_id) ON DELETE CASCADE,
  csrf_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL,
  absolute_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  recent_authenticated_at TIMESTAMPTZ NOT NULL,
  CHECK (last_seen_at >= created_at),
  CHECK (absolute_expires_at > created_at),
  CHECK (recent_authenticated_at >= created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX admin_sessions_owner_active_idx
  ON admin_sessions (owner_singleton_id, absolute_expires_at)
  WHERE revoked_at IS NULL;
