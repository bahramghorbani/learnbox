ALTER TYPE content_status ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE content_review_action ADD VALUE IF NOT EXISTS 'reject';

CREATE TYPE content_review_dimension AS ENUM (
  'german_linguistic',
  'persian_translation',
  'provenance',
  'visual',
  'audio',
  'app_flow'
);

CREATE TYPE content_review_outcome AS ENUM ('pending', 'passed', 'failed');

CREATE TABLE content_review_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_version_id UUID NOT NULL REFERENCES card_versions(id),
  dimension content_review_dimension NOT NULL,
  outcome content_review_outcome NOT NULL DEFAULT 'pending',
  reviewer_user_id UUID REFERENCES users(id),
  notes TEXT,
  check_key UUID NOT NULL UNIQUE,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (card_version_id, dimension),
  CHECK (
    (outcome = 'pending' AND reviewer_user_id IS NULL AND reviewed_at IS NULL)
    OR (outcome IN ('passed', 'failed') AND reviewer_user_id IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE INDEX content_review_checks_queue_idx
  ON content_review_checks (card_version_id, dimension)
  WHERE outcome = 'pending';
