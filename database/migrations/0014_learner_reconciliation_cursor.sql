-- M1-D per-learner monotonic reconciliation cursor (ADR 0014).
-- One integer projection version per learner; incremented only when a review
-- event is newly applied (same transaction as event insert + schedule update).
-- Never global, never a timestamp, never an acknowledgement list.
CREATE TABLE IF NOT EXISTS learner_reconciliation_cursors (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  cursor BIGINT NOT NULL DEFAULT 0 CHECK (cursor >= 0)
);

-- Atomic single-step advance owned by the write path. Returns the new cursor.
-- ON CONFLICT keeps the existing row and bumps by exactly one; the function is
-- never called for idempotent replays, conflicts, validation or clock skew.
CREATE OR REPLACE FUNCTION advance_learner_reconciliation_cursor(target_user_id UUID)
RETURNS BIGINT
LANGUAGE sql
AS $$
  INSERT INTO learner_reconciliation_cursors (user_id, cursor)
  VALUES (target_user_id, 1)
  ON CONFLICT (user_id) DO UPDATE
    SET cursor = learner_reconciliation_cursors.cursor + 1
  RETURNING cursor;
$$;