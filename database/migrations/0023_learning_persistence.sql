-- 0023_learning_persistence.sql
--
-- LB-B35 CP4: additive persistence for the unified learning system.
--
--   * users.timezone                 canonical per-learner IANA zone (owner decision O2)
--   * review_events.response         canonical binary answer ('known' | 'unknown'), NULL for legacy rows
--   * review_events.engine_version   NULL = legacy scheduler v1; keeps the activation point visible
--   * learner_daily_plans            server-owned daily new-card allowance, one row per learner-local day
--   * review_event_rejections        bounded observability for rejected review events (no payload)
--
-- Forward-only and additive. Nothing is dropped, renamed, rewritten or backfilled: every pre-existing
-- row keeps its exact values, `review_events` stays append-only (no UPDATE/DELETE path is added), the
-- four-value `grade` CHECK is untouched, and `occurred_at` is never written. Every statement is
-- idempotent so a second application is a no-op. Legacy v1.2.1 code runs unchanged on this schema.
--
-- The database validates only the SHAPE of the zone. Whether it is a real IANA zone is decided by the
-- application (`normalizeTimeZone` in the learning engine), because Postgres and the JavaScript runtime
-- disagree on the sign of fixed offsets.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS timezone text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_timezone_shape'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_timezone_shape
            CHECK (timezone IS NULL OR char_length(timezone) BETWEEN 1 AND 64);
    END IF;
END $$;

ALTER TABLE review_events
    ADD COLUMN IF NOT EXISTS response text,
    ADD COLUMN IF NOT EXISTS engine_version smallint;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'review_events_response_valid'
    ) THEN
        ALTER TABLE review_events
            ADD CONSTRAINT review_events_response_valid
            CHECK (response IS NULL OR response IN ('known', 'unknown'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'review_events_engine_version_valid'
    ) THEN
        ALTER TABLE review_events
            ADD CONSTRAINT review_events_engine_version_valid
            CHECK (engine_version IS NULL OR engine_version BETWEEN 1 AND 100);
    END IF;
END $$;

-- One frozen row per learner and learner-local day. `new_card_ids` is the day's new-card allowance
-- and is written once (INSERT ... ON CONFLICT DO NOTHING), so refreshes, second devices and repeated
-- sessions cannot keep granting new cards. Due and recovery work is NOT frozen: it is derived from
-- the live schedule on every read. The allowance size (3) is a learning-domain constant owned by
-- definitions.ts, not duplicated here. Deleted together with the learner (ON DELETE CASCADE).
CREATE TABLE IF NOT EXISTS learner_daily_plans (
    user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    local_day    date        NOT NULL,
    time_zone    text        NOT NULL CHECK (char_length(time_zone) BETWEEN 1 AND 64),
    new_card_ids uuid[]      NOT NULL DEFAULT '{}',
    created_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, local_day)
);

-- Why an event was rejected. No answer payload and no free text: a bounded reason code only.
CREATE TABLE IF NOT EXISTS review_event_rejections (
    id              bigserial   PRIMARY KEY,
    user_id         uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Same type and bound as review_events.client_event_id (TEXT, 1-128 since 0013); a uuid here would
    -- make recording a rejection fail for any non-UUID client event id.
    client_event_id text        NOT NULL CHECK (char_length(client_event_id) BETWEEN 1 AND 128),
    reason          text        NOT NULL CHECK (reason IN ('validation', 'idempotencyConflict', 'clockSkew')),
    received_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS review_event_rejections_user_idx
    ON review_event_rejections (user_id, received_at DESC);

-- Least-privilege runtime grants (LB-B30 P0 role split). Applied only where the role exists, so a
-- plain database rebuilt from migrations (tests, local) is unaffected. learnbox_app gets exactly what
-- the learner runtime needs: read and insert the plan, insert and read rejections. No UPDATE, and no
-- DELETE (account deletion removes both tables through ON DELETE CASCADE from `users`).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'learnbox_app') THEN
        GRANT SELECT, INSERT ON learner_daily_plans TO learnbox_app;
        GRANT SELECT, INSERT ON review_event_rejections TO learnbox_app;
        GRANT USAGE ON SEQUENCE review_event_rejections_id_seq TO learnbox_app;
    END IF;
END $$;
