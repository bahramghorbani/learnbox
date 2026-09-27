-- Hash-only mobile refresh sessions. Native review transport schema remains NI-004.
CREATE TABLE mobile_learner_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  installation_id TEXT NOT NULL,
  refresh_token_hash TEXT NOT NULL,
  family_generation INTEGER NOT NULL DEFAULT 0 CHECK (family_generation >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  absolute_expires_at TIMESTAMPTZ NOT NULL,
  idle_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  CHECK (absolute_expires_at > created_at),
  CHECK (idle_expires_at > created_at),
  CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL)),
  UNIQUE (refresh_token_hash)
);

CREATE INDEX mobile_learner_sessions_user_installation_idx
  ON mobile_learner_sessions (user_id, installation_id);
