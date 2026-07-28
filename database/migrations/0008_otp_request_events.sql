-- Opaque request timestamps make OTP rate limiting durable without storing a raw phone or IP.
CREATE TABLE otp_request_events (
  challenge_id UUID PRIMARY KEY REFERENCES otp_challenges(id) ON DELETE CASCADE,
  phone_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  purpose otp_purpose NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX otp_request_events_phone_window_idx
  ON otp_request_events (phone_hash, purpose, requested_at DESC);

CREATE INDEX otp_request_events_ip_window_idx
  ON otp_request_events (ip_hash, purpose, requested_at DESC);
