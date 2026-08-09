-- Closed-alpha invitation boundary. Plaintext invite codes, phones and consent text never enter
-- PostgreSQL; the server persists keyed HMAC hashes and version tokens only.
CREATE TABLE invite_codes (
  code_hash TEXT PRIMARY KEY,
  display_label TEXT,
  max_uses INTEGER NOT NULL CHECK (max_uses >= 1 AND max_uses <= 20),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0 AND used_count <= max_uses),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE invite_consents (
  code_hash TEXT NOT NULL REFERENCES invite_codes(code_hash) ON DELETE CASCADE,
  consent_version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (code_hash, consent_version)
);

CREATE TABLE invite_request_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX invite_request_events_ip_window_idx
  ON invite_request_events (ip_hash, requested_at DESC);
