-- LB-B30 role proof. Read-only against data: every statement is a zero-row form (WHERE false /
-- SELECT ... LIMIT 0) or a catalog lookup; Postgres checks privileges before touching rows, so a
-- permitted statement changes nothing and a forbidden one fails with 42501. TRUNCATE/DROP are proved
-- through the catalog (privilege + ownership), never executed. Everything runs inside one
-- transaction that is rolled back at the end.
--
-- The EXPECTED matrix below is written independently of db-roles-p0.sql, from the SQL the code runs.
-- Two checks per role x table x operation: (1) catalog privilege == expected, (2) live zero-row
-- attempt outcome == expected. Any mismatch (including an EXTRA privilege) fails the proof.
--
-- Usage (as the owner role):  psql "$OWNER_DSN" -v ON_ERROR_STOP=1 -f db-roles-p0-proof.sql

\set ON_ERROR_STOP on
BEGIN;

-- Lets the owner impersonate the roles for the live probes. Rolled back with the transaction.
GRANT learnbox_app, learnbox_admin TO CURRENT_USER WITH SET TRUE;

CREATE TEMP TABLE expected (role_name text, table_name text, op text) ON COMMIT DROP;
INSERT INTO expected
SELECT r, unnest(string_to_array(l, ' ')), o FROM (VALUES
  ('learnbox_app', 'users cards card_versions card_schedules review_events packs pack_cards user_packs banners billing_products current_splash splash_versions content_review_checks content_review_decisions admin_owner admin_role_assignments purchase_events purchase_ownership_claims account_deletion_events revoked_sessions user_session_cutoffs mobile_learner_sessions learner_reconciliation_cursors otp_challenges otp_request_events invite_codes invite_consents invite_request_events entitlement_tiers payment_logs audit_logs', 'SELECT'),
  ('learnbox_app', 'users card_schedules review_events mobile_learner_sessions otp_challenges invite_codes learner_reconciliation_cursors', 'INSERT'),
  ('learnbox_app', 'otp_request_events invite_consents invite_request_events purchase_ownership_claims account_deletion_events user_session_cutoffs revoked_sessions', 'INSERT'),
  ('learnbox_app', 'users card_schedules review_events mobile_learner_sessions otp_challenges invite_codes learner_reconciliation_cursors user_session_cutoffs', 'UPDATE'),
  ('learnbox_app', 'users review_events card_schedules learner_reconciliation_cursors mobile_learner_sessions user_packs payment_logs purchase_events revoked_sessions', 'DELETE'),
  ('learnbox_admin', 'users cards card_versions card_schedules review_events packs pack_cards banners current_splash splash_versions splash_replacement_actions private_media_cleanup_jobs content_review_checks content_review_decisions admin_owner admin_role_assignments admin_sessions admin_passkey_credentials admin_webauthn_challenges audit_logs billing_products payment_logs', 'SELECT'),
  ('learnbox_admin', 'admin_owner admin_passkey_credentials admin_sessions admin_webauthn_challenges content_review_checks current_splash splash_versions private_media_cleanup_jobs splash_replacement_actions audit_logs content_review_decisions', 'INSERT'),
  -- Content workspace (migration 0033): create content, edit it, retire it by status, never delete it.
  ('learnbox_admin', 'packs cards card_versions pack_cards', 'INSERT'),
  ('learnbox_admin', 'admin_owner admin_passkey_credentials admin_sessions admin_webauthn_challenges content_review_checks current_splash splash_versions private_media_cleanup_jobs splash_replacement_actions', 'UPDATE'),
  ('learnbox_admin', 'splash_replacement_actions admin_webauthn_challenges', 'DELETE')
) v(r, l, o);

-- Column-level grants (checked separately): role, table, column, op
CREATE TEMP TABLE expected_cols (role_name text, table_name text, col text, op text) ON COMMIT DROP;
INSERT INTO expected_cols VALUES
  ('learnbox_app', 'audit_logs', 'actor_user_id', 'UPDATE'),
  ('learnbox_admin', 'card_versions', 'status', 'UPDATE'),
  ('learnbox_admin', 'card_versions', 'published_at', 'UPDATE'),
  -- Migration 0033. Note what is absent: packs.price_tomans, packs.is_free, cards.content_id.
  ('learnbox_admin', 'card_versions', 'content_json', 'UPDATE'),
  ('learnbox_admin', 'card_versions', 'source_provider', 'UPDATE'),
  ('learnbox_admin', 'card_versions', 'source_reference', 'UPDATE'),
  ('learnbox_admin', 'packs', 'status', 'UPDATE'),
  ('learnbox_admin', 'packs', 'published_at', 'UPDATE'),
  ('learnbox_admin', 'cards', 'lemma', 'UPDATE'),
  ('learnbox_admin', 'cards', 'content_version', 'UPDATE');

CREATE TEMP TABLE results (n serial, kind text, role_name text, subject text, expected text, actual text, ok boolean) ON COMMIT DROP;

DO $$
DECLARE
  r text; t text; o text; exp boolean; act boolean; live boolean; firstcol text; coltype text; stmt text; ec record;
BEGIN
  FOREACH r IN ARRAY ARRAY['learnbox_app','learnbox_admin'] LOOP
    FOR t IN SELECT pc.relname FROM pg_class pc JOIN pg_namespace pn ON pn.oid=pc.relnamespace
             WHERE pn.nspname='public' AND pc.relkind IN ('r','p') ORDER BY 1 LOOP
      SELECT pa.attname, format_type(pa.atttypid, pa.atttypmod) INTO firstcol, coltype
        FROM pg_attribute pa WHERE pa.attrelid = format('public.%I',t)::regclass
         AND pa.attnum > 0 AND NOT pa.attisdropped ORDER BY pa.attnum LIMIT 1;
      FOREACH o IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
        exp := EXISTS (SELECT 1 FROM expected e WHERE e.role_name=r AND e.table_name=t AND e.op=o);
        act := has_table_privilege(r, format('public.%I',t), o);
        INSERT INTO results(kind,role_name,subject,expected,actual,ok)
          VALUES ('catalog', r, t||' '||o, exp::text, act::text, exp=act);
        -- live zero-row attempt under the role (privilege check happens before any row access)
        stmt := CASE o
          WHEN 'SELECT' THEN format('SELECT 1 FROM public.%I LIMIT 0', t)
          WHEN 'INSERT' THEN format('INSERT INTO public.%I (%I) SELECT NULL::%s WHERE false', t, firstcol, coltype)
          WHEN 'UPDATE' THEN format('UPDATE public.%I SET %I = %I WHERE false', t, firstcol, firstcol)
          WHEN 'DELETE' THEN format('DELETE FROM public.%I WHERE false', t) END;
        EXECUTE format('SET LOCAL ROLE %I', r);   -- outside the handler: a failure here aborts the proof
        BEGIN
          EXECUTE stmt; live := true;
        EXCEPTION WHEN insufficient_privilege THEN live := false;
                  WHEN OTHERS THEN live := true;  -- a non-privilege error still means privilege passed
        END;
        RESET ROLE;
        INSERT INTO results(kind,role_name,subject,expected,actual,ok)
          VALUES ('live', r, t||' '||o, exp::text, live::text, exp=live);
      END LOOP;
      -- never allowed for an application role
      FOREACH o IN ARRAY ARRAY['TRUNCATE','REFERENCES','TRIGGER'] LOOP
        act := has_table_privilege(r, format('public.%I',t), o);
        INSERT INTO results(kind,role_name,subject,expected,actual,ok)
          VALUES ('catalog', r, t||' '||o, 'false', act::text, NOT act);
      END LOOP;
      -- ownership: an owner could DROP/ALTER
      INSERT INTO results(kind,role_name,subject,expected,actual,ok)
        SELECT 'catalog', r, t||' OWNERSHIP(alter/drop)', 'false',
               pg_has_role(r, c2.relowner, 'MEMBER')::text, NOT pg_has_role(r, c2.relowner, 'MEMBER')
          FROM pg_class c2 WHERE c2.oid = format('public.%I',t)::regclass;
    END LOOP;
    -- column-level grants
    FOR ec IN SELECT * FROM expected_cols WHERE role_name=r LOOP
      act := has_column_privilege(r, format('public.%I',ec.table_name), ec.col, ec.op);
      INSERT INTO results(kind,role_name,subject,expected,actual,ok)
        VALUES ('column', r, ec.table_name||'.'||ec.col||' '||ec.op, 'true', act::text, act);
    END LOOP;
    -- no other column-level UPDATE beyond expected on tables without table-level UPDATE
    INSERT INTO results(kind,role_name,subject,expected,actual,ok)
      SELECT 'column', r, 'unexpected column UPDATE grants', '0', count(*)::text, count(*)=0
        FROM pg_attribute pa
        JOIN pg_class pc ON pc.oid = pa.attrelid AND pc.relkind IN ('r','p')
        JOIN pg_namespace pn ON pn.oid = pc.relnamespace AND pn.nspname = 'public'
       WHERE pa.attnum > 0 AND NOT pa.attisdropped
         AND NOT has_table_privilege(r, pc.oid, 'UPDATE')
         AND has_column_privilege(r, pc.oid, pa.attnum, 'UPDATE')
         AND NOT EXISTS (SELECT 1 FROM expected_cols e
                          WHERE e.role_name=r AND e.table_name=pc.relname AND e.col=pa.attname);
    -- DDL / role-level negatives
    INSERT INTO results(kind,role_name,subject,expected,actual,ok)
      SELECT 'ddl', r, 'CREATE on schema public', 'false', has_schema_privilege(r,'public','CREATE')::text, NOT has_schema_privilege(r,'public','CREATE');
    INSERT INTO results(kind,role_name,subject,expected,actual,ok)
      SELECT 'ddl', r, 'superuser/createdb/createrole/replication/bypassrls', 'all false',
             (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)::text,
             NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
        FROM pg_roles WHERE rolname=r;
    EXECUTE format('SET LOCAL ROLE %I', r);
    BEGIN
      EXECUTE 'CREATE TABLE public.lb_proof_forbidden(x int)';
      live := true;
    EXCEPTION WHEN insufficient_privilege THEN live := false;
    END;
    RESET ROLE;
    INSERT INTO results(kind,role_name,subject,expected,actual,ok)
      VALUES ('ddl', r, 'live CREATE TABLE', 'denied', CASE WHEN live THEN 'ALLOWED' ELSE 'denied' END, NOT live);
  END LOOP;
END $$;

\echo
SELECT kind, count(*) AS checks, count(*) FILTER (WHERE ok) AS passed, count(*) FILTER (WHERE NOT ok) AS failed
  FROM results GROUP BY kind ORDER BY kind;
\echo '--- FAILURES (empty = none):'
SELECT role_name, kind, subject, expected, actual FROM results WHERE NOT ok ORDER BY n;
SELECT CASE WHEN count(*) FILTER (WHERE NOT ok) = 0 THEN 'ROLE PROOF: PASS ('||count(*)||' checks)' ELSE 'ROLE PROOF: FAIL' END AS verdict FROM results;
ROLLBACK;
