-- M4.1 — Admin revert of the learner launch screen to the bundled default.
--
-- Reverting means deactivating the dynamic splash, which is one DELETE of the single
-- `current_splash` pointer row: the learner route joins `current_splash` to `splash_versions`, so
-- with no pointer it answers 404 and the app renders its approved bundled image.
--
-- No schema changes. No data changes. `splash_versions` rows, their `image_data` and their stored
-- objects are NEVER deleted by this operation, so every promoted splash stays re-promotable and
-- stays available as evidence; `splash_replacement_actions` and `audit_logs` are untouched.
--
-- 0011 created the splash tables; the role grants live in infrastructure/database/db-roles-p0.sql,
-- which this migration mirrors so an already-provisioned database gains the privilege too. Guarded
-- on role existence, like 0028, because local and CI databases have no least-privilege roles.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'learnbox_admin') THEN
        GRANT DELETE ON current_splash TO learnbox_admin;
    END IF;
END $$;
