-- 0053_learner_daily_new_card_preference.sql
--
-- A learner-owned ceiling for NEW cards introduced per learner-local day.
-- Existing accounts receive the product default (7) without touching frozen daily plans;
-- a row already present in learner_daily_plans remains the sole authority for that day.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS daily_new_card_allowance smallint NOT NULL DEFAULT 7;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_daily_new_card_allowance_valid'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_daily_new_card_allowance_valid
            CHECK (daily_new_card_allowance IN (3, 7, 12));
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'learnbox_app') THEN
        GRANT UPDATE (daily_new_card_allowance) ON users TO learnbox_app;
    END IF;
END $$;
