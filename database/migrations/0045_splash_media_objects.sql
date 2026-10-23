-- Database-backed fallback for owner splash image bytes, mirroring card_media_objects
-- (0025_card_media_generation.sql). Used when BLOB_READ_WRITE_TOKEN is not configured, so splash
-- replacement works on a self-hosted deployment with no Vercel Blob account.
CREATE TABLE IF NOT EXISTS splash_media_objects (
  object_key TEXT PRIMARY KEY CHECK (object_key ~ '^admin/splash/[a-z0-9-]{3,64}\.webp$'),
  media_type TEXT NOT NULL CHECK (media_type = 'image/webp'),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 8388608),
  bytes BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_admin') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON splash_media_objects TO learnbox_admin;
  END IF;
END $$;
