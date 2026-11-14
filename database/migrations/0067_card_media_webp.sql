-- 0067_card_media_webp.sql
--
-- Allow WebP in the card-media object-key shape, in addition to png/jpg/mp3.
--
-- Why: card images are now re-encoded to WebP before storage (card-image-webp.ts) to cut file
-- size roughly in half at an unchanged visual quality (same 86-quality encode already used for
-- splash and presentation-slide images). This only widens the CHECK constraints that validate an
-- object key's shape; it does not touch any existing row. Existing png/jpg rows keep working
-- unchanged — the application (website + admin) resolves Content-Type from the stored media_type,
-- never from a hardcoded assumption.

DO $$
BEGIN
  IF EXISTS (
    SELECT FROM pg_constraint WHERE conname = 'card_media_candidates_object_key_check'
  ) THEN
    ALTER TABLE card_media_candidates DROP CONSTRAINT card_media_candidates_object_key_check;
  END IF;
  ALTER TABLE card_media_candidates ADD CONSTRAINT card_media_candidates_object_key_check CHECK (
    object_key IS NULL
    OR object_key ~ '^admin/card-media/[a-z0-9-]{1,128}/(image|word_audio|sentence_audio)/[0-9a-f-]{36}\.(png|jpg|webp|mp3)$'
  ) NOT VALID;
  ALTER TABLE card_media_candidates VALIDATE CONSTRAINT card_media_candidates_object_key_check;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT FROM pg_constraint WHERE conname = 'card_media_objects_object_key_shape'
  ) THEN
    ALTER TABLE card_media_objects DROP CONSTRAINT card_media_objects_object_key_shape;
  END IF;
  ALTER TABLE card_media_objects ADD CONSTRAINT card_media_objects_object_key_shape CHECK (
    object_key ~ '^admin/card-media/[a-z0-9-]{1,128}/(image|word_audio|sentence_audio)/[0-9a-f-]{36}\.(png|jpg|webp|mp3)$'
  ) NOT VALID;
  ALTER TABLE card_media_objects VALIDATE CONSTRAINT card_media_objects_object_key_shape;
END $$;
