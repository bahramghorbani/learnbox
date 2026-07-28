-- OTP challenge records retain opaque IDs and keyed hashes only; raw phone numbers and codes never
-- enter this table. A future server adapter owns atomic creation and verification transitions.
CREATE TYPE otp_purpose AS ENUM ('sign_in');

CREATE TABLE otp_challenges (
  id UUID PRIMARY KEY,
  phone_hash TEXT NOT NULL,
  purpose otp_purpose NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  resend_available_at TIMESTAMPTZ NOT NULL,
  attempt_count SMALLINT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts SMALLINT NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK (resend_available_at >= created_at),
  CHECK (attempt_count <= max_attempts)
);

CREATE INDEX otp_challenges_phone_purpose_idx
  ON otp_challenges (phone_hash, purpose, created_at DESC);
