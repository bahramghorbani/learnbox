-- Immutable, private owner-managed launch-screen versions. Object keys are opaque storage paths;
-- public URLs, original filenames and image bytes never enter PostgreSQL.
CREATE TABLE splash_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_key TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL,
  width INTEGER NOT NULL CHECK (width >= 864),
  height INTEGER NOT NULL CHECK (height >= 1600),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 8388608),
  media_type TEXT NOT NULL CHECK (media_type = 'image/webp'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE current_splash (
  singleton_id SMALLINT PRIMARY KEY CHECK (singleton_id = 1),
  version_id UUID NOT NULL REFERENCES splash_versions(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE splash_replacement_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key_hash TEXT NOT NULL UNIQUE,
  version_id UUID REFERENCES splash_versions(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CHECK ((status = 'pending' AND completed_at IS NULL) OR (status = 'completed' AND completed_at IS NOT NULL))
);

CREATE TABLE private_media_cleanup_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_key TEXT NOT NULL UNIQUE,
  reason_code TEXT NOT NULL,
  attempt_count SMALLINT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0 AND attempt_count <= 5),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX private_media_cleanup_jobs_pending_idx
  ON private_media_cleanup_jobs (next_attempt_at, created_at)
  WHERE completed_at IS NULL;
