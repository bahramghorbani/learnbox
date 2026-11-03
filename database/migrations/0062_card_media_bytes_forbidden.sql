-- 0062_card_media_bytes_forbidden.sql
--
-- Card media bytes live only in files (migration 0061). Every Production row was moved and verified
-- on 2026-11-04, so from here the database refuses media bytes outright: a code path that tried to
-- store media in the database again fails on INSERT instead of silently growing every backup.
--
-- The 0038 learner function is left in place on purpose: in Production it is owned by the
-- superuser `postgres`, which the migration role cannot drop, and with bytes always NULL it can only
-- ever return NULL bytes. The App reads through learner_published_card_media_ref (0061).
--
-- Fails (and changes nothing) if any row still carries bytes; Production has none since the
-- 2026-11-04 move (card-media-files.mjs verify proves every row has its file).

ALTER TABLE card_media_objects
  ADD CONSTRAINT card_media_objects_bytes_in_files CHECK (bytes IS NULL) NOT VALID;
ALTER TABLE card_media_objects VALIDATE CONSTRAINT card_media_objects_bytes_in_files;
