-- Pack completion: per-medium validity and learner delivery of accepted Admin media.
--
-- Additive only. No existing row, the 35 Starter cards, or their 105 bundled files are touched.
--
-- 1. card_media_candidates.image_subject records the exact subject an image was generated for,
--    so an image is invalidated only when its own subject changes (owner rule 2026-10-16: an
--    unrelated card edit must not make every medium stale). Audio already records spoken_target,
--    voice and voice_role.
-- 2. audio_* columns record the MEASURED properties of the returned MP3 (parsed from the first
--    frame header), never the requested parameter name.
-- 3. learnbox_app gets SELECT on card_media_objects only: a published card version pins the
--    accepted object (key + SHA-256) into its content_json, and the learner media route serves
--    exactly that object after the existing pack-access check. Candidates and acceptance history
--    stay Admin-only.
ALTER TABLE card_media_candidates
  ADD COLUMN IF NOT EXISTS image_subject TEXT
    CHECK (image_subject IS NULL OR char_length(image_subject) BETWEEN 1 AND 4000),
  ADD COLUMN IF NOT EXISTS audio_sample_rate_hz INTEGER
    CHECK (audio_sample_rate_hz IS NULL OR audio_sample_rate_hz BETWEEN 8000 AND 48000),
  ADD COLUMN IF NOT EXISTS audio_bitrate_kbps INTEGER
    CHECK (audio_bitrate_kbps IS NULL OR audio_bitrate_kbps BETWEEN 8 AND 320),
  ADD COLUMN IF NOT EXISTS audio_channels SMALLINT
    CHECK (audio_channels IS NULL OR audio_channels IN (1, 2));

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_app') THEN
    GRANT SELECT ON card_media_objects TO learnbox_app;
  END IF;
END $$;
