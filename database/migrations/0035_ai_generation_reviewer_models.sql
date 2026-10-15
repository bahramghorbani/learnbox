-- Generator, independent reviewer and repair model identities are immutable per job.
-- A model is pinned when the Admin asks for a plan; a later env change cannot alter a running job.
ALTER TABLE ai_generation_jobs
    ADD COLUMN IF NOT EXISTS reviewer_model text;

ALTER TABLE ai_generation_jobs
    ADD COLUMN IF NOT EXISTS repair_model text;
