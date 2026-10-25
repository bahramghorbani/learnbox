-- First-login onboarding tour (5 slides): shown once per account, resumable if closed
-- mid-way. `seen_at` null means "still show it"; `slide` is the last slide the learner
-- was on so a half-finished tour resumes instead of restarting.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_tour_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_tour_slide SMALLINT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_app') THEN
    GRANT UPDATE (onboarding_tour_seen_at, onboarding_tour_slide) ON users TO learnbox_app;
  END IF;
END $$;
