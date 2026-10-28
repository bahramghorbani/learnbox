-- 0054_store_pack_covers.sql
-- Private, reviewable Store-pack covers. A candidate cannot become visible until accepted.

CREATE TABLE IF NOT EXISTS store_pack_cover_objects (
  object_key TEXT PRIMARY KEY CHECK (object_key ~ '^admin/store-covers/[a-z0-9-]{2,120}/[0-9a-f-]{36}\.(png|jpg|webp)$'),
  media_type TEXT NOT NULL CHECK (media_type IN ('image/png', 'image/jpeg', 'image/webp')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 8388608),
  checksum TEXT NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
  bytes BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS store_pack_cover_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id TEXT NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE REFERENCES store_pack_cover_objects(object_key) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('ready', 'accepted')) DEFAULT 'ready',
  source TEXT NOT NULL CHECK (source IN ('upload', 'ai')),
  provider TEXT,
  model TEXT,
  accepted_by_user_id UUID REFERENCES users(id),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'accepted') = (accepted_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS store_pack_cover_candidates_pack_idx ON store_pack_cover_candidates (pack_id, created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'learnbox_app') THEN
    GRANT SELECT ON store_pack_cover_objects TO learnbox_app;
    IF NOT has_table_privilege('learnbox_app', 'store_pack_cover_objects', 'SELECT') THEN
      RAISE EXCEPTION 'store pack cover app grant missing';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'learnbox_admin') THEN
    GRANT SELECT, INSERT, UPDATE ON store_pack_cover_objects, store_pack_cover_candidates TO learnbox_admin;
    IF NOT has_table_privilege('learnbox_admin', 'store_pack_cover_objects', 'INSERT')
       OR NOT has_table_privilege('learnbox_admin', 'store_pack_cover_candidates', 'UPDATE') THEN
      RAISE EXCEPTION 'store pack cover admin grants missing';
    END IF;
  END IF;
END $$;
