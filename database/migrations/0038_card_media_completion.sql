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
-- 3. Learner delivery without a table grant. A published card version pins the accepted object
--    (key + SHA-256) into its content_json. `learner_published_card_media` returns exactly that
--    pinned object of the latest published version and nothing else; learnbox_app gets EXECUTE on
--    it only, so the learner role still cannot read card_media_objects or card_media_candidates
--    (no unaccepted candidate is reachable). PUBLIC gets nothing. The caller (Website media route)
--    runs the canonical pack-access check (published AND (free OR entitled)) before calling it.
--    Re-runnable: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE, idempotent REVOKE/GRANT.
ALTER TABLE card_media_candidates
  ADD COLUMN IF NOT EXISTS image_subject TEXT
    CHECK (image_subject IS NULL OR char_length(image_subject) BETWEEN 1 AND 4000),
  ADD COLUMN IF NOT EXISTS audio_sample_rate_hz INTEGER
    CHECK (audio_sample_rate_hz IS NULL OR audio_sample_rate_hz BETWEEN 8000 AND 48000),
  ADD COLUMN IF NOT EXISTS audio_bitrate_kbps INTEGER
    CHECK (audio_bitrate_kbps IS NULL OR audio_bitrate_kbps BETWEEN 8 AND 320),
  ADD COLUMN IF NOT EXISTS audio_channels SMALLINT
    CHECK (audio_channels IS NULL OR audio_channels IN (1, 2));

CREATE OR REPLACE FUNCTION learner_published_card_media(p_content_id TEXT, p_kind TEXT)
RETURNS TABLE (media_type TEXT, bytes BYTEA)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH media AS (
    SELECT cv.content_json->'media' AS value
      FROM cards c
      JOIN LATERAL (
        SELECT content_json FROM card_versions
         WHERE card_id = c.id AND status = 'published'
         ORDER BY version DESC LIMIT 1
      ) cv ON true
     WHERE c.content_id = p_content_id
       AND p_kind IN ('image', 'word_audio', 'sentence_audio')
  ), pin AS (
    SELECT entry FROM media, jsonb_array_elements(media.value) AS entry
     WHERE jsonb_typeof(media.value) = 'array' AND entry->>'kind' = p_kind
    UNION ALL
    SELECT media.value->p_kind FROM media WHERE jsonb_typeof(media.value) = 'object'
  )
  SELECT o.media_type, o.bytes
    FROM pin
    JOIN card_media_objects o
      ON o.object_key = pin.entry->>'objectKey' AND o.checksum = pin.entry->>'checksum'
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION learner_published_card_media(TEXT, TEXT) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_app') THEN
    GRANT EXECUTE ON FUNCTION learner_published_card_media(TEXT, TEXT) TO learnbox_app;
  END IF;
END $$;
