-- 0024_ai_pack_generation_jobs.sql
--
-- Phase 1 / Milestone 1.4: durable state for AI-assisted pack generation.
--
-- One table, because the workflow has to survive across HTTP requests: the Admin approves a plan,
-- generation then runs in batches, and acceptance happens later. Nothing else in LearnBox needed a
-- job record, so this is deliberately NOT a generic job queue — no worker registry, no scheduler,
-- no retry daemon. A row is a single Admin's single generation attempt.
--
--   * plan / plan_fingerprint    the structured plan the Admin reviewed; the fingerprint binds a
--                                generation run to the exact plan that was approved
--   * generated_rows             append-only checkpoint of model output, as canonical import
--                                records. A failed batch therefore never discards earlier batches.
--   * next_batch_index           resume point; a retry re-runs THIS index instead of appending
--   * lease_until                single-flight guard: one batch per job at a time
--   * accepted_import_key        acceptance idempotency anchor, so a retried accept cannot create
--                                a second set of cards
--   * accepted_card_count        how many cards the accepted run created, so a retry can replay the
--                                real outcome instead of re-deriving it (the accepted cards are now
--                                canonical, so a fresh analysis would classify them as conflicts)
--
-- Generation writes NOTHING to packs/cards/card_versions. Canonical content appears only when the
-- Admin accepts, and then only through M1.2's write store, which forces draft status.
--
-- Forward-only and additive: a new table plus one index. Idempotent, so a second application is a
-- no-op. No existing table is altered, so every pre-1.4 code path runs unchanged on this schema.
--
-- grants: none in this file. `ai_generation_jobs` is written only by the Admin workspace, and the
-- privileges for it are granted in 0032_role_grant_repair.sql together with the rest of the
-- 0023-0031 repair, so one reviewable matrix covers every environment — including the ones that
-- had already applied this migration when the gap was found. From 0032 onward the backup role
-- also holds default SELECT on new tables and sequences, so a future table cannot repeat the
-- omission that disabled nightly backups for seven nights in 2026-10.

CREATE TABLE IF NOT EXISTS ai_generation_jobs (
    id                  uuid PRIMARY KEY,
    actor_user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    prompt              text NOT NULL,
    plan                jsonb NOT NULL,
    plan_fingerprint    text NOT NULL,
    status              text NOT NULL CHECK (
                            status IN ('planned', 'generating', 'generated', 'accepted', 'failed')
                        ),
    requested_count     integer NOT NULL CHECK (requested_count > 0),
    batch_size          integer NOT NULL CHECK (batch_size > 0),
    next_batch_index    integer NOT NULL DEFAULT 0 CHECK (next_batch_index >= 0),
    batch_attempts      integer NOT NULL DEFAULT 0 CHECK (batch_attempts >= 0),
    generated_rows      jsonb NOT NULL DEFAULT '[]'::jsonb,
    provider            text,
    model               text,
    error_code          text,
    error_message       text,
    lease_until         timestamptz,
    pack_id             text,
    accepted_import_key uuid,
    accepted_card_count integer,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- The Admin workspace lists a single owner's most recent jobs.
CREATE INDEX IF NOT EXISTS ai_generation_jobs_actor_created_idx
    ON ai_generation_jobs (actor_user_id, created_at DESC);
