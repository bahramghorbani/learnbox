-- M1-D per-event reconciliation cursor binding (ADR 0014).
-- Stores the exact learner cursor assigned to each newly applied review event so
-- idempotent replay and future learner+cursor reads use the event's own cursor.
-- Legacy rows are NOT backfilled: NULL means "applied before this migration";
-- the learner cursor remains authoritative for pre-0015 events.
ALTER TABLE review_events
  ADD COLUMN IF NOT EXISTS reconciliation_cursor BIGINT
  CHECK (reconciliation_cursor IS NULL OR reconciliation_cursor >= 0);

-- Learner + cursor reads: WHERE user_id = $1 AND reconciliation_cursor > $2
-- ORDER BY reconciliation_cursor (incremental "what happened since cursor").
CREATE INDEX IF NOT EXISTS review_events_learner_cursor_idx
  ON review_events (user_id, reconciliation_cursor);