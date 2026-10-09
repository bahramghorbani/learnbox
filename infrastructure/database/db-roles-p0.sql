-- LB-B30 least-privilege database roles: learnbox_migrator / learnbox_app / learnbox_admin.
--
-- Derived from the SQL the shipped code actually executes (learner: apps/website + apps/api;
-- Admin: the live surface after LB-B30 = auth, content review, splash), not from a guess.
-- The legacy Admin routes (gateways, transactions, users) are hard-disabled, so learnbox_admin gets
-- NO write privilege on payment_gateways. Re-enabling one must add its exact grant in a reviewed
-- change: migration 0033 did exactly that for the content workspace, which is why learnbox_admin now
-- holds INSERT on packs/cards/card_versions/pack_cards plus column-level UPDATE for the status,
-- headword and draft-content columns the shipped code writes — no DELETE, and no price column.
-- M4.2 rebuilt banner management on the shared services (Presentation workspace, Slider Manager),
-- which is why learnbox_admin now holds INSERT, UPDATE on banners — and only those two: the
-- Slider Manager cannot delete a slide, so there is deliberately no DELETE privilege.
--
-- Run as the current owner role (neondb_owner). Idempotent and additive: no data change, no
-- DROP/TRUNCATE of data. Roles are created WITHOUT a password; passwords are set by the secure
-- credential step (set-role-passwords.sh), never in this file.
--
-- Rollback: point both services back at the previous owner DSN; the roles are inert without use.

\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_migrator') THEN
    CREATE ROLE learnbox_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_app') THEN
    CREATE ROLE learnbox_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_admin') THEN
    CREATE ROLE learnbox_admin LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
  END IF;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, learnbox_app, learnbox_admin;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, learnbox_app, learnbox_admin;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, learnbox_app, learnbox_admin;

DO $$ BEGIN
  EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO learnbox_migrator, learnbox_app, learnbox_admin',
    current_database());
END $$;
GRANT USAGE ON SCHEMA public TO learnbox_migrator, learnbox_app, learnbox_admin;

-- learnbox_migrator: forward-only DDL. Never used by a running service. Full table/sequence
-- privileges plus membership in the owning role is what allows ALTER on existing tables; on Neon
-- the owner role is granted to it explicitly by the cutover runbook, not here.
GRANT CREATE ON SCHEMA public TO learnbox_migrator;
GRANT ALL ON ALL TABLES IN SCHEMA public TO learnbox_migrator;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO learnbox_migrator;

-- learnbox_app: learner runtime.
GRANT SELECT ON
  users, cards, card_versions, card_schedules, review_events, packs, pack_cards, user_packs,
  banners, billing_products, current_splash, splash_versions, content_review_checks,
  content_review_decisions, admin_owner, admin_role_assignments, purchase_events,
  purchase_ownership_claims, account_deletion_events, revoked_sessions, user_session_cutoffs,
  mobile_learner_sessions, learner_reconciliation_cursors, otp_challenges, otp_request_events,
  invite_codes, invite_consents, invite_request_events, entitlement_tiers, payment_logs
TO learnbox_app;
GRANT INSERT, UPDATE ON users, card_schedules, review_events, mobile_learner_sessions,
  otp_challenges, invite_codes, learner_reconciliation_cursors,
  user_session_cutoffs TO learnbox_app;  -- cutoffs: INSERT .. ON CONFLICT DO UPDATE (log out everywhere)
GRANT INSERT ON otp_request_events, invite_consents, invite_request_events,
  purchase_ownership_claims, account_deletion_events TO learnbox_app;
GRANT INSERT, DELETE ON revoked_sessions TO learnbox_app;
-- Account deletion (LB-B04): rows owned by the deleted learner, and audit anonymisation only.
GRANT DELETE ON users, review_events, card_schedules, learner_reconciliation_cursors,
  mobile_learner_sessions, user_packs, payment_logs, purchase_events TO learnbox_app;
GRANT SELECT ON audit_logs TO learnbox_app;
GRANT UPDATE (actor_user_id) ON audit_logs TO learnbox_app;

-- learnbox_admin: Admin runtime, live surface only.
GRANT SELECT ON
  users, cards, card_versions, card_schedules, review_events, packs, pack_cards, banners,
  current_splash, splash_versions, splash_replacement_actions, private_media_cleanup_jobs,
  content_review_checks, content_review_decisions, admin_owner, admin_role_assignments,
  admin_sessions, admin_passkey_credentials, admin_webauthn_challenges, audit_logs,
  billing_products, payment_logs
TO learnbox_admin;
GRANT INSERT, UPDATE ON admin_owner, admin_passkey_credentials, admin_sessions,
  admin_webauthn_challenges, content_review_checks, splash_versions,
  private_media_cleanup_jobs, splash_replacement_actions, banners TO learnbox_admin;
GRANT INSERT ON audit_logs, content_review_decisions TO learnbox_admin;
GRANT INSERT, UPDATE ON current_splash TO learnbox_admin;  -- INSERT .. ON CONFLICT DO UPDATE (splash activation)
GRANT UPDATE (status, published_at) ON card_versions TO learnbox_admin;
-- Content workspace (migration 0033): create and edit content, retire it by status, never delete it.
GRANT INSERT ON packs, cards, card_versions, pack_cards TO learnbox_admin;
GRANT UPDATE (status, published_at) ON packs TO learnbox_admin;
GRANT UPDATE (lemma, content_version) ON cards TO learnbox_admin;
GRANT UPDATE (content_json, source_provider, source_reference) ON card_versions TO learnbox_admin;
-- M4.1 revert-to-default deletes ONLY the single current_splash pointer row; splash_versions and
-- its stored bytes are never deleted, so history and media evidence survive a revert.
GRANT DELETE ON splash_replacement_actions, admin_webauthn_challenges, current_splash
  TO learnbox_admin;
