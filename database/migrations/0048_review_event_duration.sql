-- 0048_review_event_duration.sql
--
-- review_events.duration_ms: client-measured elapsed time on one card, in milliseconds.
-- NULL for every pre-existing row and for any client (web or native) that has not shipped
-- duration tracking yet -- additive only, no backfill, no existing column touched. The server
-- bounds it to [0, 24h] on write (apps/api/src/reviews/mobile-review-batch.request.ts); this
-- CHECK is the last-resort database-level backstop against a future write path skipping that.
ALTER TABLE review_events
    ADD COLUMN IF NOT EXISTS duration_ms integer;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'review_events_duration_ms_valid'
    ) THEN
        ALTER TABLE review_events
            ADD CONSTRAINT review_events_duration_ms_valid
            CHECK (duration_ms IS NULL OR duration_ms BETWEEN 0 AND 86400000);
    END IF;
END $$;
