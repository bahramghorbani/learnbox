CREATE TYPE content_status AS ENUM (
  'draft', 'ai_generated', 'auto_validated', 'needs_review', 'approved', 'published', 'deprecated'
);
CREATE TYPE admin_role AS ENUM ('content_reviewer', 'content_publisher', 'super_admin');
CREATE TYPE content_review_action AS ENUM ('approve', 'return_for_revision');

CREATE TABLE admin_role_assignments (
  user_id UUID NOT NULL REFERENCES users(id),
  role admin_role NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE card_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id),
  version INTEGER NOT NULL CHECK (version > 0),
  status content_status NOT NULL DEFAULT 'draft',
  content_json JSONB NOT NULL,
  source_provider TEXT NOT NULL CHECK (source_provider IN ('editorial', 'user', 'ai_suggestion')),
  source_reference TEXT,
  confidence NUMERIC(4, 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  UNIQUE (card_id, version)
);

CREATE TABLE content_review_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_version_id UUID NOT NULL REFERENCES card_versions(id),
  reviewer_user_id UUID NOT NULL REFERENCES users(id),
  action content_review_action NOT NULL,
  reason TEXT,
  decision_key UUID UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX card_versions_review_queue_idx
  ON card_versions (created_at)
  WHERE status IN ('auto_validated', 'needs_review');
CREATE INDEX content_review_decisions_version_idx
  ON content_review_decisions (card_version_id, created_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id, created_at DESC);
