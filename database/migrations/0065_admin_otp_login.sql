-- Admin OTP (phone + SMS.ir) login: challenge and rate-limit tables.
-- Raw phone numbers and codes are never stored; only HMAC-SHA256 hashes are persisted.
-- grants: infrastructure/database/db-roles-p0.sql grants learnbox_admin SELECT+INSERT+UPDATE
-- on admin_otp_challenges and SELECT+INSERT on admin_otp_request_events (no DELETE, matching the
-- existing admin_webauthn_challenges pattern). The backup role (learnbox_migrator) needs no
-- explicit grant here: migration 0032's ALTER DEFAULT PRIVILEGES already gives it SELECT on any
-- new table created from this point onward.
CREATE TABLE IF NOT EXISTS admin_otp_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  resend_available_at TIMESTAMPTZ NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);
CREATE INDEX IF NOT EXISTS admin_otp_challenges_expiry_idx ON admin_otp_challenges (expires_at) WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS admin_otp_request_events (
  challenge_id UUID NOT NULL REFERENCES admin_otp_challenges(id) ON DELETE CASCADE,
  phone_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_otp_request_events_phone_idx ON admin_otp_request_events (phone_hash, requested_at);
CREATE INDEX IF NOT EXISTS admin_otp_request_events_ip_idx ON admin_otp_request_events (ip_hash, requested_at);
