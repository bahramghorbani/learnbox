-- 0066_admin_online_learners_grant.sql
--
-- Grants `learnbox_admin` column-level SELECT on exactly the columns the dashboard's "online now"
-- counter needs, and nothing else.
--
-- Why this migration exists
-- -------------------------
-- The dashboard overview has always shown an "online now" learner count with no real number behind
-- it (`onlineNow: { state: 'unavailable', reason: 'no_data_source' }` in
-- `postgres-admin-dashboard-store.ts`), because `mobile_learner_sessions` was never granted to
-- `learnbox_admin` (only to `learnbox_app`, the learner runtime — see `db-roles-p0.sql`). This
-- migration grants the minimum columns needed to count distinct learners with a live, unrevoked
-- refresh session, which the store now uses as the "online" signal.
--
-- Granted here
-- ------------
--   mobile_learner_sessions  SELECT (user_id, last_used_at, revoked_at)
--
-- Deliberately NOT granted
-- -------------------------
--   * `refresh_token_hash`, `installation_id`, `family_generation`, `absolute_expires_at`,
--     `idle_expires_at`, `revoked_reason`, `created_at`, `id` — none are read by the counter;
--     the refresh-token hash in particular must stay invisible to Admin.
--   * No INSERT/UPDATE/DELETE. No new grant on any other table. Nothing for `learnbox_app`.
--
-- "Online" is defined as: not revoked, and the refresh token was last used within 15 minutes
-- (`postgres-admin-dashboard-store.ts`, `onlineSince`). A refresh-token "last used" timestamp is an
-- approximation of presence, not a heartbeat — the UI labels it accordingly, not as literal
-- real-time presence.
--
-- Idempotent and retry-safe: GRANT only, no DDL, no data change, guarded on role existence.
--
-- Rollback (no data or schema change to undo):
--   REVOKE SELECT (user_id, last_used_at, revoked_at) ON mobile_learner_sessions FROM learnbox_admin;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_admin') THEN
    GRANT SELECT (user_id, last_used_at, revoked_at)
      ON mobile_learner_sessions TO learnbox_admin;
  END IF;
END $$;

-- Self-verification: fail the migration rather than leave a half-granted role behind.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_admin') THEN
    IF NOT has_column_privilege('learnbox_admin', 'mobile_learner_sessions', 'user_id', 'SELECT')
       OR NOT has_column_privilege('learnbox_admin', 'mobile_learner_sessions', 'last_used_at', 'SELECT')
       OR NOT has_column_privilege('learnbox_admin', 'mobile_learner_sessions', 'revoked_at', 'SELECT') THEN
      RAISE EXCEPTION '0066: learnbox_admin online-learners grant is incomplete';
    END IF;
    -- The limits this migration must NOT cross.
    IF has_column_privilege('learnbox_admin', 'mobile_learner_sessions', 'refresh_token_hash', 'SELECT')
       OR has_table_privilege('learnbox_admin', 'mobile_learner_sessions', 'INSERT')
       OR has_table_privilege('learnbox_admin', 'mobile_learner_sessions', 'UPDATE')
       OR has_table_privilege('learnbox_admin', 'mobile_learner_sessions', 'DELETE')
       OR has_schema_privilege('learnbox_admin', 'public', 'CREATE') THEN
      RAISE EXCEPTION '0066: learnbox_admin holds a privilege this migration must not grant';
    END IF;
  END IF;
END $$;
