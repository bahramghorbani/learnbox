-- Admin-only editorial staging for immutable public dictionary release files (ADR 0017).
-- This table never backs public dictionary reads and grants nothing to learnbox_app.
CREATE TABLE dictionary_editorial_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dictionary_key TEXT NOT NULL UNIQUE,
  ai_payload JSONB NOT NULL CHECK (ai_payload->>'lemma' = dictionary_key),
  manual_payload JSONB CHECK (manual_payload IS NULL OR manual_payload->>'lemma' = dictionary_key),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'approved', 'deleted')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  source TEXT NOT NULL,
  model TEXT,
  cost_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_user_id UUID NOT NULL REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX dictionary_editorial_entries_queue_idx
  ON dictionary_editorial_entries (status, updated_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_admin') THEN
    GRANT SELECT, INSERT ON dictionary_editorial_entries TO learnbox_admin;
    -- AI provenance and generation metadata are append-only; editors can only supply manual work,
    -- lifecycle state, and the optimistic revision bookkeeping used by the API.
    GRANT UPDATE (manual_payload, status, revision, updated_by_user_id, updated_at)
      ON dictionary_editorial_entries TO learnbox_admin;
  END IF;
END $$;
