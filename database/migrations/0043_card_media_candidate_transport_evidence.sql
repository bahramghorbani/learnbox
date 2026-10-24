-- Safe provider-call evidence: no credentials, request body or arbitrary response headers.
ALTER TABLE card_media_candidates
  ADD COLUMN IF NOT EXISTS provider_stage TEXT,
  ADD COLUMN IF NOT EXISTS provider_elapsed_ms INTEGER,
  ADD COLUMN IF NOT EXISTS provider_http_status INTEGER,
  ADD COLUMN IF NOT EXISTS provider_request_id TEXT;
