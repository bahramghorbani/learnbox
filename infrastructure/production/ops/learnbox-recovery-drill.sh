#!/usr/bin/env bash
# LearnBox full recovery drill (N2).
#
# WHY THIS EXISTS
# ---------------
# learnbox-restore-drill.sh proves the nightly archive restores: schema, data, ledger, no orphans.
# It does NOT prove the database is usable afterwards, because the nightly dump is a plain
# `pg_dump` of one database and therefore contains **zero GRANT and zero CREATE ROLE statements**:
#
#     $ gzip -dc learnbox-*.sql.gz | grep -c '^GRANT'       -> 0
#     $ gzip -dc learnbox-*.sql.gz | grep -c 'CREATE ROLE'  -> 0
#
# Restoring it into a fresh cluster yields a database where learnbox_app and learnbox_admin do not
# exist and no ACL is set, so the learner and the Admin workspace both fail closed on their first
# query. Role and privilege state survives only a Neon branch/PITR restore, and the Production plan
# retains six hours of history. Beyond that window the dump is the only artifact, so the privilege
# half of recovery has to come from the repository — and be proven to.
#
# WHAT IT PROVES
# --------------
# The complete documented recovery sequence, end to end, on a DISPOSABLE database:
#   1. restore the archive                        (schema + data, no roles, no ACLs)
#   2. apply infrastructure/database/db-roles-p0.sql   (creates the three roles, base grants)
#   3. replay the role-guarded grant blocks of migrations 0023/0028/0029/0030/0031/0032/0033/0034
#      — their GRANTs are wrapped in `IF EXISTS (SELECT FROM pg_roles ...)`, so they were no-ops
#      when first applied to a database whose roles did not yet exist, and they are idempotent
#   4. set role passwords and connect AS learnbox_app and AS learnbox_admin
#   5. diff the resulting effective privileges against role-privilege-baseline.txt
#   6. assert the recovery granted no elevated privilege
#
# SAFETY
# ------
# The drill target is always a throwaway container created here and removed on exit. The script
# never accepts a remote target, never reads DATABASE_URL, and issues no statement against
# Production in any code path. `--capture` is the one mode that touches a real database: it runs a
# read-only transaction of catalogue lookups and nothing else.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ROLES_SQL="$REPO_ROOT/infrastructure/database/db-roles-p0.sql"
BASELINE="$REPO_ROOT/infrastructure/database/role-privilege-baseline.txt"
MIGRATIONS_DIR="$REPO_ROOT/database/migrations"

BACKUP_DIR="${LEARNBOX_BACKUP_DIR:-/home/ubuntu/learnbox/backups}"
PG_IMAGE="${LEARNBOX_PG_IMAGE:-postgres:17-alpine}"
STATE_DIR="${LEARNBOX_MONITOR_STATE_DIR:-/home/ubuntu/learnbox/ops/state}"

# Migrations whose GRANTs sit inside a role-existence guard and must be replayed once the roles
# exist. Every one is verified replay-safe and idempotent by this drill itself (step 3).
GRANT_REPLAY_VERSIONS=(0023 0028 0029 0030 0031 0032 0033 0034)

# ---------------------------------------------------------------------------------------------
# The effective-privilege query. Deterministic and diffable: one line per granted privilege, with
# the database name normalised so a recovery target of any name compares against the baseline.
# Column privileges are reported only where the role lacks the table-level verb, which is what
# makes a column-level grant a real restriction rather than a duplicate of a table grant.
# ---------------------------------------------------------------------------------------------
privilege_query() {
  cat <<'SQL'
BEGIN TRANSACTION READ ONLY;
\pset tuples_only on
\pset format unaligned
WITH roles(rolname) AS (VALUES ('learnbox_app'),('learnbox_admin'),('learnbox_migrator')),
tbl AS (SELECT c.oid, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relkind IN ('r','p')),
seq AS (SELECT c.oid, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relkind='S')
SELECT line FROM (
  SELECT format('TABLE %s %s %s', r.rolname, t.relname, p.op) AS line
    FROM roles r CROSS JOIN tbl t
    CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(op)
   WHERE has_table_privilege(r.rolname, t.oid, p.op)
  UNION ALL
  SELECT format('COLUMN %s %s.%s %s', r.rolname, t.relname, a.attname, p.op)
    FROM roles r CROSS JOIN tbl t
    JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped
    CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(op)
   WHERE NOT has_table_privilege(r.rolname, t.oid, p.op)
     AND has_column_privilege(r.rolname, t.oid, a.attnum, p.op)
  UNION ALL
  SELECT format('SEQUENCE %s %s %s', r.rolname, s.relname, p.op)
    FROM roles r CROSS JOIN seq s
    CROSS JOIN (VALUES ('SELECT'),('USAGE'),('UPDATE')) p(op)
   WHERE has_sequence_privilege(r.rolname, s.oid, p.op)
  UNION ALL
  SELECT format('SCHEMA %s public %s', r.rolname, p.op)
    FROM roles r CROSS JOIN (VALUES ('USAGE'),('CREATE')) p(op)
   WHERE has_schema_privilege(r.rolname, 'public', p.op)
  UNION ALL
  SELECT format('DATABASE %s <DB> %s', r.rolname, p.op)
    FROM roles r CROSS JOIN (VALUES ('CONNECT'),('CREATE'),('TEMP')) p(op)
   WHERE has_database_privilege(r.rolname, current_database(), p.op)
) q ORDER BY line;
ROLLBACK;
SQL
}

# ---------------------------------------------------------------------------------------------
# --capture: refresh the committed baseline from a live database, READ-ONLY.
# Usage: learnbox-recovery-drill.sh --capture "$LEARNBOX_MIGRATOR_DATABASE_URL"
# The DSN is passed on stdin-equivalent (argv of a container psql) and never written anywhere.
# ---------------------------------------------------------------------------------------------
if [ "${1:-}" = "--capture" ]; then
  dsn="${2:-}"
  [ -n "$dsn" ] || { echo "recovery-drill --capture: a read-only DSN is required" >&2; exit 2; }
  tmpq="$(mktemp)"; trap 'rm -f "$tmpq"' EXIT
  privilege_query > "$tmpq"
  docker run --rm -i --network host -v "$tmpq:/q.sql:ro" "$PG_IMAGE" \
    psql "$dsn" -v ON_ERROR_STOP=1 -At -f /q.sql | grep -E '^(TABLE|COLUMN|SEQUENCE|SCHEMA|DATABASE) ' | sort
  exit 0
fi

# ---------------------------------------------------------------------------------------------
# Full drill.
# ---------------------------------------------------------------------------------------------
for required in "$ROLES_SQL" "$BASELINE" "$MIGRATIONS_DIR"; do
  [ -e "$required" ] || { echo "recovery-drill: missing repository input $required" >&2; exit 1; }
done

archive="${1:-}"
if [ -z "$archive" ]; then
  archive="$(ls -1t "$BACKUP_DIR"/learnbox-*.sql.gz 2>/dev/null | head -1 || true)"
fi
[ -n "$archive" ] && [ -f "$archive" ] || { echo "recovery-drill: no backup archive found" >&2; exit 1; }

SCRATCH="lb-recovery-drill-$$"
# Throwaway, random, never persisted: these credentials exist only inside this container.
rand() { head -c 18 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
PW_APP="$(rand)"; PW_ADMIN="$(rand)"; PW_MIGRATOR="$(rand)"

CID=""  # set only once this run has created the container; cleanup never touches anything else
cleanup() { [ -n "$CID" ] && docker rm -fv "$CID" >/dev/null 2>&1 || true; }
trap cleanup EXIT

checks=0; failures=0
check() { # check <description> <expected> <actual>
  checks=$((checks + 1))
  if [ "$2" = "$3" ]; then
    printf 'ok   %-72s %s\n' "$1" "$3"
  else
    failures=$((failures + 1))
    printf 'FAIL %-72s expected=%s actual=%s\n' "$1" "$2" "$3"
  fi
}

psql_as() { # psql_as <role> <password> <sql>  -> prints result, or DENIED/ERROR
  docker exec -e PGPASSWORD="$2" "$SCRATCH" \
    psql "postgres://$1@127.0.0.1:5432/drill" -tAc "$3" 2>&1 | tr -d '\n'
}
outcome_as() { # outcome_as <role> <password> <sql> -> allowed|denied
  if docker exec -e PGPASSWORD="$2" "$SCRATCH" \
       psql "postgres://$1@127.0.0.1:5432/drill" -v ON_ERROR_STOP=1 -tAc "$3" >/dev/null 2>/tmp/lb-rd-err.$$; then
    echo allowed
  elif grep -q 'permission denied' /tmp/lb-rd-err.$$; then
    echo denied
  else
    echo "error:$(tr -d '\n' < /tmp/lb-rd-err.$$ | tail -c 120)"
  fi
}
owner() { docker exec -i "$SCRATCH" psql -q -1 -v ON_ERROR_STOP=1 -U postgres -d drill; }
q() { docker exec "$SCRATCH" psql -U postgres -d drill -tAc "$1" 2>/dev/null | tr -d ' \n'; }

echo "recovery-drill: archive $(basename "$archive")"
echo "recovery-drill: archive sha256 $(sha256sum "$archive" 2>/dev/null | cut -d' ' -f1 || shasum -a 256 "$archive" | cut -d' ' -f1)"

# --- step 0: disposable target. No published ports: reachable only through docker exec.
CID=$(docker run -d --rm --name "$SCRATCH" -e POSTGRES_PASSWORD="$(rand)" -e POSTGRES_DB=drill \
  "$PG_IMAGE")
ready=0
for _ in $(seq 1 45); do
  docker exec "$SCRATCH" pg_isready -U postgres -d drill >/dev/null 2>&1 && { ready=1; break; }
  sleep 2
done
check "disposable postgres is ready" 1 "$ready"
[ "$ready" = 1 ] || { echo "recovery-drill: scratch database never became ready" >&2; exit 1; }

# --- step 1: restore the archive. Schema and data only; the dump carries no roles and no ACLs.
grants_in_dump="$(gzip -dc "$archive" | grep -c '^GRANT' || true)"
roles_in_dump="$(gzip -dc "$archive" | grep -c 'CREATE ROLE' || true)"
check "nightly dump carries no GRANT statements (the gap this drill closes)" 0 "$grants_in_dump"
check "nightly dump carries no CREATE ROLE statements" 0 "$roles_in_dump"

restored=0
gzip -dc "$archive" | docker exec -i "$SCRATCH" \
  psql -v ON_ERROR_STOP=1 -U postgres -d drill >/dev/null 2>/tmp/lb-rd-restore.$$ && restored=1
check "archive restores with no error" 1 "$restored"
[ "$restored" = 1 ] || { tail -c 400 /tmp/lb-rd-restore.$$ >&2; exit 1; }
rm -f /tmp/lb-rd-restore.$$

check "ledger head is restored" "$(grep -oE '[0-9]{4}_[a-z0-9_]+' <<<"$(ls -1 "$MIGRATIONS_DIR" | sort | tail -1)")" "$(q "select max(version) from schema_migrations")"
check "roles are absent immediately after the restore" 0 \
  "$(q "select count(*) from pg_roles where rolname in ('learnbox_app','learnbox_admin','learnbox_migrator')")"

# --- step 2: the role model. db-roles-p0.sql creates the three roles and the base grants.
roles_applied=0
owner < "$ROLES_SQL" >/dev/null 2>&1 && roles_applied=1
check "db-roles-p0.sql applies cleanly" 1 "$roles_applied"
check "three least-privilege roles now exist" 3 \
  "$(q "select count(*) from pg_roles where rolname in ('learnbox_app','learnbox_admin','learnbox_migrator')")"

# --- step 3: replay the role-guarded grant blocks, twice, to prove idempotency.
for pass in 1 2; do
  replayed=0
  for version in "${GRANT_REPLAY_VERSIONS[@]}"; do
    file="$(ls "$MIGRATIONS_DIR/${version}_"*.sql 2>/dev/null | head -1)"
    [ -n "$file" ] || { echo "recovery-drill: migration $version not found" >&2; exit 1; }
    # -1 matches the migration runner, which wraps each file in BEGIN/COMMIT. Without it a
    # migration using CREATE TEMP TABLE ... ON COMMIT DROP loses the table between statements.
    if owner < "$file" >/dev/null 2>&1; then replayed=$((replayed + 1)); fi
  done
  check "grant migrations replay cleanly (pass $pass of 2 — idempotent)" "${#GRANT_REPLAY_VERSIONS[@]}" "$replayed"
done

# --- step 4: credentials and real connectivity as each runtime role.
owner <<SQL >/dev/null 2>&1
ALTER ROLE learnbox_app      WITH PASSWORD '$PW_APP';
ALTER ROLE learnbox_admin    WITH PASSWORD '$PW_ADMIN';
ALTER ROLE learnbox_migrator WITH PASSWORD '$PW_MIGRATOR';
SQL
check "learnbox_app connects and reads learner data"    1 "$(psql_as learnbox_app "$PW_APP" 'select 1')"
check "learnbox_admin connects and reads Admin data"    1 "$(psql_as learnbox_admin "$PW_ADMIN" 'select 1')"
check "learnbox_migrator connects (backup/ledger role)" 1 "$(psql_as learnbox_migrator "$PW_MIGRATOR" 'select 1')"
check "learnbox_migrator can read the ledger" "$(q "select count(*) from schema_migrations")" \
  "$(psql_as learnbox_migrator "$PW_MIGRATOR" 'select count(*) from schema_migrations')"

# Statement shapes the shipped code actually executes, in zero-row form: Postgres checks the
# privilege before it touches a row, so a permitted statement changes nothing.
check "admin: SELECT store_listings (Store workspace)" allowed \
  "$(outcome_as learnbox_admin "$PW_ADMIN" 'select 1 from store_listings limit 0')"
check "admin: SELECT purchase_events (read-only on payment facts)" allowed \
  "$(outcome_as learnbox_admin "$PW_ADMIN" 'select 1 from purchase_events limit 0')"
check "admin: UPDATE users.status (suspension)" allowed \
  "$(outcome_as learnbox_admin "$PW_ADMIN" 'update users set status=status where false')"
check "admin: UPDATE packs.display_name (pack metadata, migration 0034)" allowed \
  "$(outcome_as learnbox_admin "$PW_ADMIN" 'update packs set display_name=display_name where false')"
check "admin: INSERT audit_logs (append-only audit)" allowed \
  "$(outcome_as learnbox_admin "$PW_ADMIN" 'insert into audit_logs (id) select null where false')"
check "admin: INSERT banners (Slider Manager)" allowed \
  "$(outcome_as learnbox_admin "$PW_ADMIN" 'insert into banners (id) select null where false')"
check "app: SELECT users (learner runtime)" allowed \
  "$(outcome_as learnbox_app "$PW_APP" 'select 1 from users limit 0')"
check "app: INSERT review_events (learner progress)" allowed \
  "$(outcome_as learnbox_app "$PW_APP" 'insert into review_events (id) select null where false')"

# --- step 5: the privilege model is reproduced exactly, not approximately.
tmpq="$(mktemp)"; privilege_query > "$tmpq"
docker cp "$tmpq" "$SCRATCH:/privq.sql" >/dev/null
rm -f "$tmpq"
recovered="$(mktemp)"
docker exec "$SCRATCH" psql -U postgres -d drill -At -f /privq.sql 2>/dev/null \
  | grep -E '^(TABLE|COLUMN|SEQUENCE|SCHEMA|DATABASE) ' | sort > "$recovered"
expected="$(mktemp)"
grep -E '^(TABLE|COLUMN|SEQUENCE|SCHEMA|DATABASE) ' "$BASELINE" | sort > "$expected"

# learnbox_app and learnbox_admin are the runtime security boundary: a MISSING line means recovery
# left the product broken, an EXTRA line means recovery granted more than Production had. Both fail.
grep -E ' learnbox_(app|admin) ' "$expected"  > "$expected.aa"
grep -E ' learnbox_(app|admin) ' "$recovered" > "$recovered.aa"
missing="$(comm -23 "$expected.aa" "$recovered.aa" | wc -l | tr -d ' ')"
extra="$(comm -13 "$expected.aa" "$recovered.aa" | wc -l | tr -d ' ')"
check "app+admin privileges present in baseline count" "$(wc -l < "$expected.aa" | tr -d ' ')" "$(wc -l < "$recovered.aa" | tr -d ' ')"
check "app+admin privileges MISSING after recovery" 0 "$missing"
check "app+admin privileges EXTRA after recovery (elevation)" 0 "$extra"
[ "$missing" = 0 ] || { echo '--- missing:'; comm -23 "$expected.aa" "$recovered.aa"; }
[ "$extra" = 0 ]   || { echo '--- extra:';   comm -13 "$expected.aa" "$recovered.aa"; }

# learnbox_migrator's full-verb set depends on which tables existed at cutover time, so the
# assertion that matters is total SELECT coverage: one unreadable table or sequence is what
# silently disabled the nightly backup for seven nights (see migration 0032).
tables="$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')")"
seqs="$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='S'")"
check "migrator can SELECT every table (backup readability)" "$tables" \
  "$(grep -c '^TABLE learnbox_migrator .* SELECT$' "$recovered" || true)"
check "migrator can SELECT every sequence (the 7-night outage cause)" "$seqs" \
  "$(grep -c '^SEQUENCE learnbox_migrator .* SELECT$' "$recovered" || true)"

# --- step 6: the recovery granted no elevated privilege.
for role in learnbox_app learnbox_admin; do
  check "$role: no superuser/createdb/createrole/replication/bypassrls" f \
    "$(q "select (rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls) from pg_roles where rolname='$role'")"
  check "$role: owns no table (cannot DROP or ALTER)" 0 \
    "$(q "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and pg_has_role('$role', c.relowner, 'MEMBER')")"
  check "$role: no CREATE on schema public" f "$(q "select has_schema_privilege('$role','public','CREATE')")"
  check "$role: holds no TRUNCATE/REFERENCES/TRIGGER anywhere" 0 \
    "$(grep -cE "^TABLE $role .* (TRUNCATE|REFERENCES|TRIGGER)$" "$recovered" || true)"
  check "$role: is a member of no other role" 0 \
    "$(q "select count(*) from pg_auth_members m join pg_roles r on r.oid=m.member where r.rolname='$role'")"
done
check "admin: DELETE on packs is denied (content is retired, never deleted)" denied \
  "$(outcome_as learnbox_admin "$PW_ADMIN" 'delete from packs where false')"
check "admin: UPDATE packs.price_tomans is denied (commercial config is owner-only)" denied \
  "$(outcome_as learnbox_admin "$PW_ADMIN" 'update packs set price_tomans=price_tomans where false')"
check "admin: UPDATE review_events is denied (learner progress is not Admin's)" denied \
  "$(outcome_as learnbox_admin "$PW_ADMIN" 'update review_events set id=id where false')"
check "admin: UPDATE card_schedules is denied (learner progress is not Admin's)" denied \
  "$(outcome_as learnbox_admin "$PW_ADMIN" 'update card_schedules set user_id=user_id where false')"
check "admin: UPDATE audit_logs is denied (audit is append-only)" denied \
  "$(outcome_as learnbox_admin "$PW_ADMIN" 'update audit_logs set id=id where false')"
check "admin: CREATE TABLE is denied" denied \
  "$(outcome_as learnbox_admin "$PW_ADMIN" 'create table lb_drill_forbidden(x int)')"
check "app: write to Admin tables is denied (learner isolation)" denied \
  "$(outcome_as learnbox_app "$PW_APP" 'delete from admin_sessions where false')"
check "app: write to content is denied (learner cannot author)" denied \
  "$(outcome_as learnbox_app "$PW_APP" 'insert into packs (id) select null where false')"

rm -f "$expected" "$expected.aa" "$recovered" "$recovered.aa" /tmp/lb-rd-err.$$

# --- verdict. A truncated run must not pass as a complete one.
# The number of checks above this line. A probe that dies mid-run (a dropped connection, a container
# that never came up) otherwise leaves a short all-green list that reads as a pass; raise this when
# adding a check.
EXPECTED_CHECKS=45
echo
check "every planned check reported (a truncated run is not a pass)" "$EXPECTED_CHECKS" "$((checks))"

if [ -d "$STATE_DIR" ] || mkdir -p "$STATE_DIR" 2>/dev/null; then
  cat > "$STATE_DIR/recovery-drill.status" <<EOF
status=$([ "$failures" -eq 0 ] && echo ok || echo failed)
at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
archive=$(basename "$archive")
checks=$checks
failures=$failures
target=disposable-container-only
production_touched=no
EOF
fi

echo
if [ "$failures" -eq 0 ]; then
  echo "RECOVERY DRILL: PASS ($checks checks)"
else
  echo "RECOVERY DRILL: FAIL ($failures of $checks checks)" >&2
  exit 1
fi
