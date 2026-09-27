-- Persistent scheduling state. Review history remains append-only in review_events.
CREATE TABLE card_schedules (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  state learning_state NOT NULL DEFAULT 'new',
  stability_days DOUBLE PRECISION NOT NULL DEFAULT 0.0416666667 CHECK (stability_days > 0),
  difficulty DOUBLE PRECISION NOT NULL DEFAULT 5 CHECK (difficulty >= 1 AND difficulty <= 10),
  lapses INTEGER NOT NULL DEFAULT 0 CHECK (lapses >= 0),
  due_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_reviewed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, card_id)
);

CREATE INDEX card_schedules_due_idx
  ON card_schedules (user_id, due_at)
  WHERE state NOT IN ('suspended', 'archived');

CREATE INDEX review_events_user_card_occurred_idx
  ON review_events (user_id, card_id, occurred_at DESC);
