-- Durable, browser-independent pack-media generation.
--
-- A job snapshots the exact card version selected during Admin approval. It generates candidates
-- only; acceptance and publication remain separate manual actions. `dispatching` is deliberately
-- non-retryable after its lease expires: a provider answer may have been lost after a paid request.

CREATE TABLE IF NOT EXISTS pack_media_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id TEXT NOT NULL REFERENCES packs (id),
  actor_user_id UUID NOT NULL REFERENCES users (id),
  request_key UUID NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'stopped', 'completed', 'needs_attention')),
  stop_requested BOOLEAN NOT NULL DEFAULT false,
  estimated_max_seconds INTEGER NOT NULL CHECK (estimated_max_seconds >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pack_media_job_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES pack_media_jobs (id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES cards (id),
  kind TEXT NOT NULL CHECK (kind IN ('image', 'word_audio', 'sentence_audio')),
  card_version_id UUID NOT NULL REFERENCES card_versions (id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'leased', 'dispatching', 'generated', 'not_needed',
      'in_progress', 'needs_attention', 'stopped'
    )),
  candidate_id UUID REFERENCES card_media_candidates (id),
  detail TEXT,
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pack_media_job_items_one_item UNIQUE (job_id, card_id, kind)
);

CREATE INDEX IF NOT EXISTS pack_media_job_items_claim_idx
  ON pack_media_job_items (status, created_at) WHERE status IN ('pending', 'leased', 'dispatching');
-- One actor may have one active or unresolved approval for a pack. This is the cross-request
-- single-flight gate; `needs_attention` remains blocking because its provider outcome is unknown.
CREATE UNIQUE INDEX IF NOT EXISTS pack_media_jobs_one_active_per_actor_pack
  ON pack_media_jobs (actor_user_id, pack_id) WHERE status IN ('queued', 'running', 'needs_attention');
CREATE INDEX IF NOT EXISTS pack_media_jobs_actor_pack_idx
  ON pack_media_jobs (actor_user_id, pack_id, created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_admin') THEN
    GRANT SELECT, INSERT, UPDATE ON pack_media_jobs, pack_media_job_items TO learnbox_admin;
  END IF;
END $$;
