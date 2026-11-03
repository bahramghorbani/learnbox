-- 0061_card_media_files.sql
--
-- Card media bytes move from the database to immutable files on the Production host.
--
-- Why: card_media_objects.bytes was ~216MB of a ~245MB database, so every nightly dump re-copied all
-- media. Files are written once under an opaque, CHECK-validated object_key and never rewritten.
--
-- This step is backward compatible and additive:
--   * `bytes` becomes nullable. A row either still carries its bytes (legacy) or has NULL and its
--     bytes live in the file named by object_key. byte_size and checksum stay NOT NULL, so every
--     reader can verify the file it reads against the database record.
--   * The existing learner_published_card_media(text, text) is left untouched: an App image that
--     predates this migration keeps working for as long as rows still carry bytes.
--   * learner_published_card_media_ref(text, text) is the new SECURITY DEFINER read. It applies the
--     exact same published-pin rule (object key AND checksum must match the latest PUBLISHED version)
--     and returns the reference — key, checksum, size — plus bytes when the row still has them.
--     The learner role still has no grant on card_media_objects itself.
--
-- A later migration forbids bytes in this table outright, once every row has been moved to files.

ALTER TABLE card_media_objects ALTER COLUMN bytes DROP NOT NULL;

DO $$
BEGIN
  -- object_key becomes a file path: re-assert the key shape on the objects table itself, so no row
  -- can ever name a path outside the media root. NOT VALID + VALIDATE keeps the lock short.
  IF NOT EXISTS (
    SELECT FROM pg_constraint WHERE conname = 'card_media_objects_object_key_shape'
  ) THEN
    ALTER TABLE card_media_objects ADD CONSTRAINT card_media_objects_object_key_shape CHECK (
      object_key ~ '^admin/card-media/[a-z0-9-]{1,128}/(image|word_audio|sentence_audio)/[0-9a-f-]{36}\.(png|jpg|mp3)$'
    ) NOT VALID;
    ALTER TABLE card_media_objects VALIDATE CONSTRAINT card_media_objects_object_key_shape;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION learner_published_card_media_ref(p_content_id TEXT, p_kind TEXT)
RETURNS TABLE (media_type TEXT, object_key TEXT, checksum TEXT, byte_size INTEGER, bytes BYTEA)
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
  SELECT o.media_type, o.object_key, o.checksum, o.byte_size, o.bytes
    FROM pin
    JOIN card_media_objects o
      ON o.object_key = pin.entry->>'objectKey' AND o.checksum = pin.entry->>'checksum'
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION learner_published_card_media_ref(TEXT, TEXT) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_app') THEN
    GRANT EXECUTE ON FUNCTION learner_published_card_media_ref(TEXT, TEXT) TO learnbox_app;
  END IF;
END $$;
-- No new Admin grant: the one-off move of existing bytes to files runs as the schema owner.
