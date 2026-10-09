-- 0032_role_grant_repair.sql
--
-- Least-privilege grant repair for every table added by 0023-0031, plus default privileges so a
-- table created by a FUTURE migration can never again silently break the nightly backup.
--
-- Why this migration exists
-- -------------------------
-- The production backup failed seven consecutive nights (2026-10-03 .. 2026-10-09). Root cause was
-- not the backup job: 0023 created `review_event_rejections` and granted the learner role what it
-- needed, but granted the backup role (`learnbox_migrator`) nothing — not on the table, and not on
-- its `bigserial` sequence. `pg_dump` reads every sequence with
-- `SELECT last_value, is_called FROM <seq>`, which needs SELECT; the USAGE privilege that lets a
-- role call `nextval()` is NOT sufficient. One unreadable sequence aborts the entire dump, so the
-- database had no independent backup for a week while the alert said only "pg_dump did not
-- complete".
--
-- 0024, 0025 and 0026 repeat the same omission for five more tables. Applying them to production as
-- they stand would re-break the backup the same night and leave Admin reads failing under the
-- least-privilege roles. This migration closes that gap before those migrations ever reach
-- production, and removes the whole class of failure for future tables.
--
-- Scope rules encoded here
-- ------------------------
--   * learnbox_app and learnbox_admin get table-level, verb-level grants derived from the SQL the
--     shipped code actually executes — never `ALL`, never a schema-wide write grant. Each verb
--     below is justified by a real statement in the repository (file references inline).
--   * learnbox_migrator is the backup and ledger-reading role. It gets SELECT — and only SELECT —
--     on every table and every sequence in `public`. Schema-wide is correct HERE because an
--     enumerated list is exactly what went stale and broke the backup; read-only keeps it safe.
--     This migration deliberately does NOT extend migrator's write privileges to the new tables:
--     DDL runs as the owning role, not as migrator.
--   * ALTER DEFAULT PRIVILEGES is set ONLY for the backup role and ONLY for SELECT. Application
--     roles keep getting explicit per-table grants in the migration that creates the table, so a
--     new table is never silently readable or writable by the learner or Admin surface.
--
-- Default privileges apply to objects created by ONE role: the role that runs the migrations
-- (`current_user` here — `neondb_owner` in production, which owns every existing table). If the
-- migrating role ever changes, this statement must be re-run as the new role. The restricted-role
-- test suite asserts the default privileges exist, so a change that breaks the assumption fails CI
-- rather than a future backup.
--
-- Idempotent and retry-safe: GRANT and ALTER DEFAULT PRIVILEGES are idempotent, there is no DDL,
-- no data change and no destructive statement, so re-running this migration is a no-op. Every
-- block is guarded on role existence, so it is also a no-op on developer and CI databases that
-- have no least-privilege roles (those connect as the owner).
--
-- Rollback: `REVOKE` the individual grants below. Nothing here changes data, schema or ownership,
-- so rolling back the application to an older image needs no database change at all.

-- learnbox_app — learner runtime (apps/website).
--   store_listings  SELECT  : apps/website/lib/store-catalog.ts reads the published Store listing.
--   purchase_events INSERT  : apps/website/lib/store-purchase.ts:140 INSERT ... RETURNING id.
--                   UPDATE  : apps/website/lib/store-purchase.ts settles pending -> paid/failed.
--   user_packs      INSERT  : apps/website/lib/store-purchase.ts grants the entitlement
--                             (INSERT ... ON CONFLICT DO NOTHING; no UPDATE verb required).
-- SELECT and DELETE on purchase_events/user_packs already come from infrastructure/database/db-roles-p0.sql.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_app') THEN
    GRANT SELECT ON store_listings TO learnbox_app;
    GRANT INSERT, UPDATE ON purchase_events TO learnbox_app;
    GRANT INSERT ON user_packs TO learnbox_app;
  END IF;
END $$;

-- learnbox_admin — Admin workspace (apps/admin). AI generation and card media are Admin-only
-- surfaces; the learner runtime never touches these tables and gets no privilege on them.
--   ai_generation_jobs     SELECT, INSERT, UPDATE : apps/admin/lib/server/ai-pack-generation-service.ts
--                                                   enqueues a job and advances its status.
--   card_media_objects     SELECT, INSERT, DELETE : apps/admin/lib/server/card-media-storage.ts
--                                                   stores and removes generated media objects.
--   card_media_candidates  SELECT, INSERT, UPDATE : apps/admin/lib/server/card-media-generation-service.ts
--                                                   (INSERT ... ON CONFLICT DO NOTHING, then review).
--   card_media_assets      SELECT, INSERT, UPDATE : same service, upsert keyed (card_id, kind) with
--                                                   ON CONFLICT DO UPDATE — which needs both verbs.
--   store_listings         SELECT, INSERT, UPDATE : apps/admin/lib/server/postgres-store-listings-store.ts:289
--                                                   upsert keyed on pack_id with ON CONFLICT DO UPDATE.
-- No DELETE on store_listings: withdrawing an offer sets is_listed = false, it does not delete the
-- row, and the only DELETE FROM banners in the tree is a test fixture, not shipped code.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_admin') THEN
    GRANT SELECT, INSERT, UPDATE ON ai_generation_jobs TO learnbox_admin;
    GRANT SELECT, INSERT, DELETE ON card_media_objects TO learnbox_admin;
    GRANT SELECT, INSERT, UPDATE ON card_media_candidates TO learnbox_admin;
    GRANT SELECT, INSERT, UPDATE ON card_media_assets TO learnbox_admin;
    GRANT SELECT, INSERT, UPDATE ON store_listings TO learnbox_admin;
  END IF;
END $$;

-- learnbox_migrator — nightly pg_dump and the schema_migrations ledger reader.
-- SELECT on every table AND every sequence: the sequence half is the privilege whose absence
-- caused the seven-night outage.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_migrator') THEN
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO learnbox_migrator;
    GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO learnbox_migrator;

    -- Future-proofing: anything the migrating role creates from now on is readable by the backup
    -- role at creation time, so a missing grant can never again silently disable backups.
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT ON TABLES TO learnbox_migrator',
      current_user);
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT ON SEQUENCES TO learnbox_migrator',
      current_user);
  END IF;
END $$;

-- Self-verification. A grant repair that silently did nothing is worse than a failed migration:
-- the next backup would fail at 02:32 instead of here, so assert the end state and abort the
-- transaction (the runner wraps each migration in one) if any privilege is missing.
DO $$
DECLARE
  missing text;
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_migrator') THEN
    SELECT string_agg(format('%s.%s', c.relkind, c.relname), ', ')
      INTO missing
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p', 'S')
       AND NOT CASE c.relkind
                 WHEN 'S' THEN has_sequence_privilege('learnbox_migrator', c.oid, 'SELECT')
                 ELSE has_table_privilege('learnbox_migrator', c.oid, 'SELECT')
               END;
    IF missing IS NOT NULL THEN
      RAISE EXCEPTION 'backup role cannot read: %', missing;
    END IF;
  END IF;

  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_app') THEN
    IF NOT has_table_privilege('learnbox_app', 'store_listings', 'SELECT')
       OR NOT has_table_privilege('learnbox_app', 'purchase_events', 'INSERT')
       OR NOT has_table_privilege('learnbox_app', 'purchase_events', 'UPDATE')
       OR NOT has_table_privilege('learnbox_app', 'user_packs', 'INSERT') THEN
      RAISE EXCEPTION 'learner runtime grants incomplete after 0032';
    END IF;
  END IF;

  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_admin') THEN
    IF NOT has_table_privilege('learnbox_admin', 'ai_generation_jobs', 'INSERT')
       OR NOT has_table_privilege('learnbox_admin', 'card_media_assets', 'UPDATE')
       OR NOT has_table_privilege('learnbox_admin', 'card_media_objects', 'DELETE')
       OR NOT has_table_privilege('learnbox_admin', 'store_listings', 'UPDATE') THEN
      RAISE EXCEPTION 'admin workspace grants incomplete after 0032';
    END IF;
  END IF;
END $$;
