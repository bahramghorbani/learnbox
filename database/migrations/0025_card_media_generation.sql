-- 0025_card_media_generation.sql
--
-- Phase 1 / Milestone 1.5: durable state for AI-assisted card media (image, word audio,
-- sentence audio).
--
-- Two tables, because generation, acceptance and publishing are separate steps:
--
--   * card_media_candidates   every generation attempt. A candidate is NOT learner-visible and
--                             NOT canonical. Rows accumulate; a new attempt never mutates an
--                             earlier one, so a failed or rejected regeneration cannot damage
--                             media the Admin already accepted.
--   * card_media_assets       the single accepted asset per (card, kind). The primary key IS the
--                             idempotency anchor: accepting the same candidate twice updates one
--                             row to the same value and can never create a second association.
--
-- Bytes never enter PostgreSQL. As with the owner-splash media, `object_key` is an opaque private
-- object-storage path and this table holds only integrity and attribution data. A credential is
-- never stored in either table.
--
-- Attribution is enforced by CHECK rather than left to application convention:
--   * an audio candidate must record the exact spoken target, the voice, and the resolved voice
--     role — so it is always provable after the fact that a noun's word audio actually included
--     its canonical article, and which voice spoke it;
--   * `uses_die_fallback_for_das` records that a DAS/neuter card deterministically used the DIE
--     female voice because no younger German voice was configured, so the fallback is never silent;
--   * an image candidate must record the canonical visual-standard version it was generated under.
--
-- Forward-only and additive: two new tables plus indexes, no existing table altered. Idempotent,
-- so a second application is a no-op and every pre-1.5 code path runs unchanged on this schema.

CREATE TABLE IF NOT EXISTS card_media_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'word_audio', 'sentence_audio')),
  status TEXT NOT NULL CHECK (status IN ('generating', 'ready', 'failed', 'accepted', 'superseded')),

  -- Private object storage. NULL until bytes exist; unique so one object backs one candidate.
  object_key TEXT UNIQUE CHECK (
    object_key IS NULL
    OR object_key ~ '^admin/card-media/[a-z0-9-]{1,128}/(image|word_audio|sentence_audio)/[0-9a-f-]{36}\.(png|jpg|mp3)$'
  ),
  checksum TEXT CHECK (checksum IS NULL OR checksum ~ '^[a-f0-9]{64}$'),
  byte_size INTEGER CHECK (byte_size IS NULL OR (byte_size > 0 AND byte_size <= 8388608)),
  media_type TEXT CHECK (
    media_type IS NULL OR media_type IN ('image/png', 'image/jpeg', 'audio/mpeg')
  ),

  -- Attribution: which gateway and which underlying model actually produced this candidate.
  provider TEXT NOT NULL CHECK (char_length(provider) BETWEEN 1 AND 128),
  model TEXT NOT NULL CHECK (char_length(model) BETWEEN 1 AND 128),
  capability TEXT NOT NULL CHECK (capability IN ('image', 'audio')),

  -- Audio attribution and canonical-rule evidence.
  spoken_target TEXT CHECK (spoken_target IS NULL OR char_length(spoken_target) BETWEEN 1 AND 2000),
  voice TEXT CHECK (voice IS NULL OR char_length(voice) BETWEEN 1 AND 128),
  voice_role TEXT CHECK (
    voice_role IS NULL
    OR voice_role IN ('der_masculine', 'die_feminine', 'das_neuter', 'default_no_article')
  ),
  uses_die_fallback_for_das BOOLEAN NOT NULL DEFAULT false,
  language TEXT CHECK (language IS NULL OR language = 'de'),
  locale TEXT CHECK (locale IS NULL OR locale = 'de-DE'),

  -- Image attribution: the canonical visual standard this candidate was generated under.
  image_standard_version TEXT CHECK (
    image_standard_version IS NULL OR char_length(image_standard_version) BETWEEN 1 AND 32
  ),

  estimated_cost_unit NUMERIC(12, 6) CHECK (estimated_cost_unit IS NULL OR estimated_cost_unit >= 0),
  failure_code TEXT CHECK (failure_code IS NULL OR char_length(failure_code) BETWEEN 1 AND 64),
  superseded_by_candidate_id UUID REFERENCES card_media_candidates(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A usable candidate must carry complete integrity data.
  CONSTRAINT card_media_candidates_ready_is_complete CHECK (
    status NOT IN ('ready', 'accepted', 'superseded')
    OR (
      object_key IS NOT NULL
      AND checksum IS NOT NULL
      AND byte_size IS NOT NULL
      AND media_type IS NOT NULL
    )
  ),
  -- Audio must be provably German and provably carry its spoken target and voice identity.
  CONSTRAINT card_media_candidates_audio_attribution CHECK (
    capability <> 'audio'
    OR (
      spoken_target IS NOT NULL
      AND voice IS NOT NULL
      AND voice_role IS NOT NULL
      AND language = 'de'
      AND locale = 'de-DE'
    )
  ),
  -- Only a neuter card can carry the DIE fallback marker.
  CONSTRAINT card_media_candidates_das_fallback_requires_neuter CHECK (
    uses_die_fallback_for_das = false OR voice_role = 'das_neuter'
  ),
  -- An image must name the canonical standard it followed.
  CONSTRAINT card_media_candidates_image_attribution CHECK (
    capability <> 'image' OR image_standard_version IS NOT NULL
  ),
  -- Media kind and capability must agree.
  CONSTRAINT card_media_candidates_kind_matches_capability CHECK (
    (kind = 'image' AND capability = 'image')
    OR (kind IN ('word_audio', 'sentence_audio') AND capability = 'audio')
  )
);

CREATE INDEX IF NOT EXISTS card_media_candidates_card_kind_idx
  ON card_media_candidates (card_id, kind, created_at DESC);

CREATE INDEX IF NOT EXISTS card_media_candidates_ready_idx
  ON card_media_candidates (card_id, kind)
  WHERE status = 'ready';

-- Single flight: at most one in-progress generation per card and kind. A duplicate submission, a
-- double click or a replayed request is therefore refused by the database rather than billed twice.
CREATE UNIQUE INDEX IF NOT EXISTS card_media_candidates_single_flight_idx
  ON card_media_candidates (card_id, kind)
  WHERE status = 'generating';

-- Exactly one accepted asset per card and kind. Acceptance replay is therefore a no-op.
CREATE TABLE IF NOT EXISTS card_media_assets (
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'word_audio', 'sentence_audio')),
  candidate_id UUID NOT NULL REFERENCES card_media_candidates(id),
  accepted_by_user_id UUID REFERENCES users(id),
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (card_id, kind)
);

CREATE INDEX IF NOT EXISTS card_media_assets_candidate_idx
  ON card_media_assets (candidate_id);
