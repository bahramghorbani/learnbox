\set QUIET on
\pset tuples_only on
\pset format unaligned
\pset fieldsep '|'
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL timezone = 'UTC';
SET LOCAL datestyle = 'ISO, MDY';
SET LOCAL intervalstyle = 'postgres';
SET LOCAL extra_float_digits = 1;
SET LOCAL bytea_output = 'hex';
-- per-table row count + order-independent content hash
SELECT format('SELECT %L, ''rows'', count(*), coalesce(sum((''x''||substr(md5(x::text),1,15))::bit(60)::bigint),0) FROM public.%I x', relname, relname)
  FROM pg_class WHERE relkind IN ('r','p') AND relnamespace = 'public'::regnamespace ORDER BY relname \gexec
-- sequences
SELECT format('SELECT %L, ''seq'', last_value, is_called FROM public.%I', relname, relname)
  FROM pg_class WHERE relkind = 'S' AND relnamespace = 'public'::regnamespace ORDER BY relname \gexec
-- ACLs (relations, columns, schema, functions, types, default privileges; Neon platform role excluded)
SELECT c.relname, 'relacl', c.relkind, coalesce(c.relacl::text,'-') FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p','S','v','m') ORDER BY 1;
SELECT c.relname || '.' || a.attname, 'attacl', '-', a.attacl::text FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
 WHERE c.relnamespace = 'public'::regnamespace AND a.attacl IS NOT NULL ORDER BY 1;
SELECT nspname, 'nspacl', pg_get_userbyid(nspowner), nspacl::text FROM pg_namespace WHERE nspname = 'public';
SELECT p.oid::regprocedure::text, 'proacl', pg_get_userbyid(p.proowner), coalesce(p.proacl::text,'-') FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace AND pg_get_userbyid(p.proowner) <> 'cloud_admin' ORDER BY 1;
SELECT pg_get_userbyid(defaclrole), 'defacl', defaclobjtype::text, defaclacl::text FROM pg_default_acl
 WHERE pg_get_userbyid(defaclrole) <> 'cloud_admin' ORDER BY 1,3;
SELECT r.rolname, 'role', m.rolname, '-' FROM pg_auth_members a JOIN pg_roles r ON r.oid = a.roleid JOIN pg_roles m ON m.oid = a.member
 WHERE r.rolname IN ('learnbox_app','learnbox_admin','learnbox_migrator') ORDER BY 1,3;
SELECT rolname, 'roleattr', rolinherit::text || '/' || rolcanlogin::text || '/' || rolsuper::text || '/' || rolbypassrls::text, '-' FROM pg_roles
 WHERE rolname IN ('learnbox_app','learnbox_admin','learnbox_migrator','neondb_owner') ORDER BY 1;
SELECT 'database', 'connect_acl', '-', has_database_privilege('learnbox_app', current_database(), 'CONNECT')::text || has_database_privilege('learnbox_admin', current_database(), 'CONNECT')::text || has_database_privilege('learnbox_migrator', current_database(), 'CONNECT')::text;
ROLLBACK;
