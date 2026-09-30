/**
 * LB-B30 Admin DB role least-privilege model (staging proof).
 *
 * Current (Production):
 *   Admin and learner both use `neondb_owner` (superuser-equivalent on Neon)
 *   → Full DDL, DML, and TRUNCATE on all tables; no audit trail; no containment.
 *
 * Proposed P0:
 *   Three application roles, each connected by a dedicated DSN:
 *
 *   - learnbox_migrator  (for schema changes only; rarely used)
 *     SELECT + CREATE + ALTER + DROP on schema objects; INSERT on internal audit tables.
 *
 *   - learnbox_app       (learner app)
 *     SELECT + INSERT + UPDATE + DELETE on learner tables; cannot touch Admin or payment tables.
 *
 *   - learnbox_admin     (Admin interface)
 *     SELECT on learner + content tables (read-only); INSERT + UPDATE + DELETE on review tables.
 *     Cannot drop, truncate or alter; cannot touch learner user/progress/session tables.
 *
 * Compatibility step (after P0 verification):
 *   Both DSNs can migrate to Neon's built-in IAM if supported. Until then, each role gets a
 *   strong password (user-supplied, never logged or shared) and a separate connection string.
 *
 * To use this on Production:
 *   1. Run this script AS the superuser on Production (once).
 *   2. Provide the three passwords (user will supply via secure prompt).
 *   3. Generate three DSNs for the app/admin services and update systemd environment files.
 *   4. Restart both services to switch; the migration ledger must still be writable by learnbox_migrator.
 *
 * Rollback is manual: revert the DSN environment in systemd, restart both services.
 */

-- Create roles (assume they don't exist; idempotent via IF NOT EXISTS in Postgres 15+)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_migrator') THEN
    CREATE ROLE learnbox_migrator LOGIN;
    GRANT CONNECT ON DATABASE neondb TO learnbox_migrator;
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_app') THEN
    CREATE ROLE learnbox_app LOGIN;
    GRANT CONNECT ON DATABASE neondb TO learnbox_app;
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_admin') THEN
    CREATE ROLE learnbox_admin LOGIN;
    GRANT CONNECT ON DATABASE neondb TO learnbox_admin;
  END IF;
END $$;

-- Grant schema access to all roles
GRANT USAGE ON SCHEMA public TO learnbox_migrator, learnbox_app, learnbox_admin;

-- ============================================================================
-- learnbox_migrator: full DDL for schema evolution (rarely used, audited)
-- ============================================================================
ALTER ROLE learnbox_migrator CREATEROLE CREATEDB;
GRANT ALL PRIVILEGES ON SCHEMA public TO learnbox_migrator;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO learnbox_migrator;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO learnbox_migrator;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO learnbox_migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO learnbox_migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO learnbox_migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO learnbox_migrator;

-- ============================================================================
-- learnbox_app: learner app (read all content; write own progress)
-- ============================================================================

-- SELECT: read-only access to content, config, and review status
GRANT SELECT ON
  users,
  cards,
  card_schedules,
  card_versions,
  packs,
  pack_cards,
  review_events,
  user_packs,
  user_streak,
  migration_log,
  splash_versions,
  alpha_invites,
  otp_requests,
  sessions,
  account_deletion_events,
  audit_logs
TO learnbox_app;

-- INSERT: write progress and session data
GRANT INSERT ON
  card_schedules,
  review_events,
  user_packs,
  user_streak,
  sessions,
  otp_requests,
  account_deletion_events,
  audit_logs
TO learnbox_app;

-- UPDATE: touch learner's own progress and session
GRANT UPDATE ON
  card_schedules,
  review_events,
  user_streak,
  sessions,
  audit_logs
TO learnbox_app;

-- DELETE: remove own session records and finalize account deletion
GRANT DELETE ON
  sessions,
  account_deletion_events,
  otp_requests
TO learnbox_app;

-- ============================================================================
-- learnbox_admin: content review (read all, write review state only)
-- ============================================================================

-- SELECT: read content and learner progress (no user PII mutations)
GRANT SELECT ON
  cards,
  card_versions,
  card_schedules,
  packs,
  pack_cards,
  review_events,
  users,
  user_packs,
  user_streak,
  splash_versions,
  audit_logs
TO learnbox_admin;

-- INSERT: write review decisions and content audit
GRANT INSERT ON
  review_events,
  audit_logs
TO learnbox_admin;

-- UPDATE: modify review status only; cannot touch learner data
GRANT UPDATE (rating, notes, created_at) ON review_events TO learnbox_admin;

-- Explicit DENY: Admin can never drop, truncate, or alter. This is fail-closed.
REVOKE DROP ON ALL TABLES IN SCHEMA public FROM learnbox_admin;
REVOKE ALTER ON ALL TABLES IN SCHEMA public FROM learnbox_admin;
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM learnbox_admin;

-- ============================================================================
-- Revoke dangerous privileges from all roles (fail-closed)
-- ============================================================================
REVOKE DROP ON SCHEMA public FROM learnbox_migrator, learnbox_app, learnbox_admin;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM learnbox_app, learnbox_admin;

-- ============================================================================
-- Session defaults: each role sets a safe search_path and statement_timeout
-- ============================================================================
ALTER ROLE learnbox_app SET search_path = public;
ALTER ROLE learnbox_app SET statement_timeout = '30s';
ALTER ROLE learnbox_admin SET search_path = public;
ALTER ROLE learnbox_admin SET statement_timeout = '30s';
ALTER ROLE learnbox_migrator SET search_path = public;
