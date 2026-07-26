-- Foundation schema. Apply through the future migration runner, never manually in production.
CREATE TYPE learning_state AS ENUM ('new', 'learning', 'review', 'relearning', 'mastered', 'suspended', 'archived');
CREATE TABLE users (
  id UUID PRIMARY KEY,
  phone_e164 TEXT UNIQUE NOT NULL,
  first_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE cards (
  id UUID PRIMARY KEY,
  lemma TEXT NOT NULL,
  content_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE review_events (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  card_id UUID NOT NULL REFERENCES cards(id),
  grade TEXT NOT NULL CHECK (grade IN ('forgot', 'hard', 'remembered', 'mastered')),
  occurred_at TIMESTAMPTZ NOT NULL,
  client_event_id UUID UNIQUE NOT NULL
);
