-- 0068_card_media_webp_type.sql
--
-- Fix: 0067 widened the object-key SHAPE constraints to accept .webp, but missed the
-- media_type ALLOWLIST constraints on the same two tables. Any card image successfully
-- re-encoded to WebP (card-image-webp.ts) stores media_type = 'image/webp', which this
-- allowlist still rejected — every such insert would fail the CHECK constraint and the
-- card generation would fail. This widens the allowlist; no existing row is touched.

DO $$
BEGIN
  IF EXISTS (
    SELECT FROM pg_constraint WHERE conname = 'card_media_objects_media_type_check'
  ) THEN
    ALTER TABLE card_media_objects DROP CONSTRAINT card_media_objects_media_type_check;
  END IF;
  ALTER TABLE card_media_objects ADD CONSTRAINT card_media_objects_media_type_check CHECK (
    media_type = ANY (ARRAY['image/png', 'image/jpeg', 'image/webp', 'audio/mpeg'])
  ) NOT VALID;
  ALTER TABLE card_media_objects VALIDATE CONSTRAINT card_media_objects_media_type_check;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT FROM pg_constraint WHERE conname = 'card_media_candidates_media_type_check'
  ) THEN
    ALTER TABLE card_media_candidates DROP CONSTRAINT card_media_candidates_media_type_check;
  END IF;
  ALTER TABLE card_media_candidates ADD CONSTRAINT card_media_candidates_media_type_check CHECK (
    media_type IS NULL
    OR media_type = ANY (ARRAY['image/png', 'image/jpeg', 'image/webp', 'audio/mpeg'])
  ) NOT VALID;
  ALTER TABLE card_media_candidates VALIDATE CONSTRAINT card_media_candidates_media_type_check;
END $$;
