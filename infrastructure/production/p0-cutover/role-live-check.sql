-- LB-B30 Production role check. Runs AS the role (real login). Zero-row statements; always ROLLBACK.
-- usage: psql "$ROLE_URL" -v ON_ERROR_STOP=1 -v role=learnbox_app -f prod-role-live-check.sql
\set QUIET on
BEGIN;
SELECT set_config('lb.res','',true);
DO $$
DECLARE
  me text := current_user;
  pos text[]; neg text[]; s text; res text := '';
BEGIN
  IF me = 'learnbox_app' THEN
    pos := ARRAY[
      'SELECT count(*) FROM users', 'SELECT count(*) FROM cards', 'SELECT count(*) FROM card_versions',
      'SELECT count(*) FROM revoked_sessions', 'SELECT count(*) FROM user_session_cutoffs',
      'SELECT count(*) FROM account_deletion_events', 'SELECT count(*) FROM audit_logs',
      'INSERT INTO review_events SELECT * FROM review_events WHERE false',
      'UPDATE card_schedules SET user_id=user_id WHERE false',
      'INSERT INTO user_session_cutoffs SELECT * FROM user_session_cutoffs WHERE false',
      'UPDATE user_session_cutoffs SET user_id=user_id WHERE false',
      'INSERT INTO revoked_sessions SELECT * FROM revoked_sessions WHERE false',
      'DELETE FROM revoked_sessions WHERE false',
      'INSERT INTO account_deletion_events SELECT * FROM account_deletion_events WHERE false',
      'DELETE FROM users WHERE false', 'DELETE FROM review_events WHERE false',
      'INSERT INTO mobile_learner_sessions SELECT * FROM mobile_learner_sessions WHERE false'];
    neg := ARRAY[
      'SELECT count(*) FROM admin_sessions', 'SELECT count(*) FROM admin_passkey_credentials',
      'SELECT count(*) FROM admin_webauthn_challenges', 'SELECT count(*) FROM splash_replacement_actions',
      'INSERT INTO admin_sessions SELECT * FROM admin_sessions WHERE false',
      'INSERT INTO admin_owner SELECT * FROM admin_owner WHERE false',
      'UPDATE cards SET id=id WHERE false', 'INSERT INTO cards SELECT * FROM cards WHERE false',
      'DELETE FROM cards WHERE false', 'INSERT INTO card_versions SELECT * FROM card_versions WHERE false',
      'UPDATE card_versions SET status=status WHERE false', 'DELETE FROM packs WHERE false',
      'UPDATE account_deletion_events SET id=id WHERE false',
      'DELETE FROM account_deletion_events WHERE false',
      'INSERT INTO audit_logs SELECT * FROM audit_logs WHERE false', 'DELETE FROM audit_logs WHERE false',
      'UPDATE audit_logs SET action=action WHERE false',
      'UPDATE revoked_sessions SET user_id=user_id WHERE false',
      'TRUNCATE users', 'TRUNCATE review_events', 'TRUNCATE account_deletion_events',
      'DROP TABLE users', 'ALTER TABLE users ADD COLUMN zz_probe int', 'CREATE TABLE public.zz_probe(i int)',
      'CREATE INDEX zz_probe ON users(id)', 'CREATE ROLE zz_probe', 'CREATE SCHEMA zz_probe',
      'DROP TABLE schema_migrations', 'INSERT INTO schema_migrations SELECT * FROM schema_migrations WHERE false',
      'UPDATE schema_migrations SET version=version WHERE false'];
  ELSIF me = 'learnbox_admin' THEN
    pos := ARRAY[
      'SELECT count(*) FROM users', 'SELECT count(*) FROM cards', 'SELECT count(*) FROM card_versions',
      'SELECT count(*) FROM content_review_checks', 'SELECT count(*) FROM admin_sessions',
      'SELECT count(*) FROM audit_logs', 'SELECT count(*) FROM current_splash',
      'INSERT INTO admin_sessions SELECT * FROM admin_sessions WHERE false',
      'UPDATE admin_sessions SET token_hash=token_hash WHERE false',
      'INSERT INTO admin_passkey_credentials SELECT * FROM admin_passkey_credentials WHERE false',
      'INSERT INTO admin_webauthn_challenges SELECT * FROM admin_webauthn_challenges WHERE false',
      'DELETE FROM admin_webauthn_challenges WHERE false',
      'INSERT INTO content_review_checks SELECT * FROM content_review_checks WHERE false',
      'INSERT INTO content_review_decisions SELECT * FROM content_review_decisions WHERE false',
      'INSERT INTO audit_logs SELECT * FROM audit_logs WHERE false',
      'INSERT INTO current_splash SELECT * FROM current_splash WHERE false',
      'UPDATE current_splash SET singleton_id=singleton_id WHERE false',
      'UPDATE card_versions SET status=status, published_at=published_at WHERE false'];
    neg := ARRAY[
      'SELECT count(*) FROM mobile_learner_sessions', 'SELECT count(*) FROM otp_challenges',
      'SELECT count(*) FROM invite_codes', 'SELECT count(*) FROM revoked_sessions',
      'SELECT count(*) FROM user_session_cutoffs', 'SELECT count(*) FROM account_deletion_events',
      'INSERT INTO users SELECT * FROM users WHERE false', 'UPDATE users SET id=id WHERE false',
      'DELETE FROM users WHERE false', 'DELETE FROM review_events WHERE false',
      'UPDATE review_events SET user_id=user_id WHERE false', 'INSERT INTO review_events SELECT * FROM review_events WHERE false',
      'UPDATE card_schedules SET user_id=user_id WHERE false',
      'INSERT INTO cards SELECT * FROM cards WHERE false', 'UPDATE cards SET id=id WHERE false',
      'DELETE FROM cards WHERE false', 'INSERT INTO card_versions SELECT * FROM card_versions WHERE false',
      'DELETE FROM card_versions WHERE false', 'UPDATE audit_logs SET action=action WHERE false',
      'DELETE FROM audit_logs WHERE false', 'DELETE FROM content_review_checks WHERE false',
      'DELETE FROM admin_sessions WHERE false',
      'TRUNCATE users', 'TRUNCATE audit_logs', 'TRUNCATE review_events',
      'DROP TABLE users', 'ALTER TABLE users ADD COLUMN zz_probe int', 'CREATE TABLE public.zz_probe(i int)',
      'CREATE ROLE zz_probe', 'CREATE SCHEMA zz_probe', 'DROP TABLE schema_migrations',
      'UPDATE schema_migrations SET version=version WHERE false'];
  ELSE
    RAISE EXCEPTION 'unexpected role %', me;
  END IF;

  FOREACH s IN ARRAY pos LOOP
    BEGIN EXECUTE s; res := res || E'P|1|' || s || E'\n';
    EXCEPTION WHEN OTHERS THEN res := res || E'P|0|' || s || ' => ' || SQLSTATE || ' ' || SQLERRM || E'\n'; END;
  END LOOP;
  FOREACH s IN ARRAY neg LOOP
    BEGIN EXECUTE s; res := res || E'N|0|' || s || E' => SUCCEEDED (should be denied)\n';
    EXCEPTION WHEN insufficient_privilege THEN res := res || E'N|1|' || s || E'\n';
              WHEN OTHERS THEN res := res || E'N|0|' || s || ' => wrong error ' || SQLSTATE || ' ' || SQLERRM || E'\n'; END;
  END LOOP;
  PERFORM set_config('lb.res', res, true);
END $$;
-- session properties, as the role itself (appended to the same transaction-local result)
SELECT set_config('lb.res', current_setting('lb.res') ||
  (SELECT E'Q|' || CASE WHEN NOT (rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls) THEN '1' ELSE '0' END || E'|role attributes all NO\n' FROM pg_roles WHERE rolname=current_user) ||
  E'Q|' || CASE WHEN NOT pg_has_role(current_user,'neondb_owner','MEMBER') THEN '1' ELSE '0' END || E'|not a member of neondb_owner\n' ||
  (SELECT E'Q|' || CASE WHEN count(*)=0 THEN '1' ELSE '0' END || E'|owns no objects in public\n' FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND pg_get_userbyid(c.relowner)=current_user) ||
  (SELECT E'Q|' || CASE WHEN count(*)=0 THEN '1' ELSE '0' END || E'|member of no other roles\n' FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)), true);
SELECT current_user AS role,
  (SELECT count(*) FROM regexp_split_to_table(current_setting('lb.res'), E'\n') l WHERE l ~ '^P\|1') AS pos_pass,
  (SELECT count(*) FROM regexp_split_to_table(current_setting('lb.res'), E'\n') l WHERE l ~ '^N\|1') AS neg_denied,
  (SELECT count(*) FROM regexp_split_to_table(current_setting('lb.res'), E'\n') l WHERE l ~ '^Q\|1') AS props_ok,
  (SELECT count(*) FROM regexp_split_to_table(current_setting('lb.res'), E'\n') l WHERE l ~ '^[PNQ]\|0') AS FAIL;
SELECT l AS failure FROM regexp_split_to_table(current_setting('lb.res'), E'\n') l WHERE l ~ '^[PNQ]\|0';
ROLLBACK;
