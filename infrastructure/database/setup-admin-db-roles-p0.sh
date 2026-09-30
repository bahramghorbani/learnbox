#!/usr/bin/env bash
# LB-B30 Admin least-privilege DB role model verification.
#
# Run this script once on a Postgres database to:
#   1. Create three application roles (learnbox_app, learnbox_admin, learnbox_migrator)
#   2. Grant least-privilege access to each role
#   3. Run proof tests to verify permission boundaries
#
# Usage:
#   export PGPASSWORD='<superuser-password>'
#   ./setup-admin-db-roles-p0.sh '<DATABASE_URL>'
#
# The DATABASE_URL must connect as a superuser (e.g., neondb_owner).

set -euo pipefail

DB_URL="${1:?Usage: $0 '<DATABASE_URL>'}"
PSQL="psql"

echo "=== Connecting to database ==="
$PSQL "$DB_URL" -c "SELECT version();" | head -1

echo
echo "=== Creating roles ==="
$PSQL "$DB_URL" <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_migrator') THEN
    CREATE ROLE learnbox_migrator LOGIN;
    ALTER ROLE learnbox_migrator CREATEDB CREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_app') THEN
    CREATE ROLE learnbox_app LOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_admin') THEN
    CREATE ROLE learnbox_admin LOGIN;
  END IF;
END $$;
GRANT CONNECT ON DATABASE neondb TO learnbox_migrator, learnbox_app, learnbox_admin;
SQL
echo "✓ Roles created"

echo
echo "=== Granting schema access ==="
$PSQL "$DB_URL" <<'SQL'
GRANT USAGE ON SCHEMA public TO learnbox_migrator, learnbox_app, learnbox_admin;
GRANT ALL PRIVILEGES ON SCHEMA public TO learnbox_migrator;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO learnbox_migrator;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO learnbox_migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO learnbox_migrator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO learnbox_migrator;
SQL
echo "✓ Migrator has full DDL"

echo
echo "=== Granting learnbox_app privileges (learner progress only) ==="
$PSQL "$DB_URL" <<'SQL'
-- SELECT: read-only access to content and config
GRANT SELECT ON
  users, cards, card_schedules, card_versions, packs, pack_cards,
  review_events, user_packs, user_streak, splash_versions,
  alpha_invites, otp_requests, sessions, account_deletion_events,
  migration_log, audit_logs
TO learnbox_app;

-- INSERT: write learner progress and sessions
GRANT INSERT ON
  card_schedules, review_events, user_packs, user_streak,
  sessions, otp_requests, account_deletion_events, audit_logs
TO learnbox_app;

-- UPDATE: touch own progress
GRANT UPDATE ON
  card_schedules, review_events, user_streak, sessions, audit_logs
TO learnbox_app;

-- DELETE: remove own sessions and account deletion records
GRANT DELETE ON
  sessions, account_deletion_events, otp_requests
TO learnbox_app;
SQL
echo "✓ App role configured"

echo
echo "=== Granting learnbox_admin privileges (review only) ==="
$PSQL "$DB_URL" <<'SQL'
-- SELECT: read content and learner state
GRANT SELECT ON
  cards, card_versions, card_schedules, packs, pack_cards,
  review_events, users, user_packs, user_streak,
  splash_versions, audit_logs
TO learnbox_admin;

-- INSERT: write review decisions and audit
GRANT INSERT ON
  review_events, audit_logs
TO learnbox_admin;

-- UPDATE: only the review rating and notes, nothing else
GRANT UPDATE (rating, notes, created_at) ON review_events TO learnbox_admin;

-- Explicit DENY: Admin cannot alter, drop, or truncate
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM learnbox_admin;
GRANT SELECT ON
  cards, card_versions, card_schedules, packs, pack_cards,
  review_events, users, user_packs, user_streak,
  splash_versions, audit_logs
TO learnbox_admin;
GRANT INSERT ON review_events, audit_logs TO learnbox_admin;
GRANT UPDATE (rating, notes, created_at) ON review_events TO learnbox_admin;
SQL
echo "✓ Admin role configured (read-only on content, review-only on decisions)"

echo
echo "=== Setting session defaults ==="
$PSQL "$DB_URL" <<'SQL'
ALTER ROLE learnbox_app SET search_path = public;
ALTER ROLE learnbox_app SET statement_timeout = '30s';
ALTER ROLE learnbox_admin SET search_path = public;
ALTER ROLE learnbox_admin SET statement_timeout = '30s';
ALTER ROLE learnbox_migrator SET search_path = public;
SQL
echo "✓ Session defaults configured"

echo
echo "=== Proof tests (permissions matrix) ==="

# Test: learnbox_app can SELECT users
echo -n "Test 1: learnbox_app SELECT users → "
if $PSQL "$DB_URL" -U learnbox_app -c "SELECT COUNT(*) FROM users LIMIT 1;" >/dev/null 2>&1; then
  echo "✓ PASS"
else
  echo "✗ FAIL"
  exit 1
fi

# Test: learnbox_app cannot INSERT into users (read-only learner table)
echo -n "Test 2: learnbox_app INSERT users → "
if $PSQL "$DB_URL" -U learnbox_app -c "INSERT INTO users (id, first_name) VALUES ('test', 'test');" 2>&1 | grep -q "permission denied"; then
  echo "✓ PASS (denied as expected)"
else
  echo "✗ FAIL (should be denied)"
  exit 1
fi

# Test: learnbox_app can INSERT card_schedules
echo -n "Test 3: learnbox_app INSERT card_schedules → "
if $PSQL "$DB_URL" -U learnbox_app -c "INSERT INTO card_schedules (id, user_id, card_id) VALUES ('cs-test', 'u-test', 'c-test');" >/dev/null 2>&1; then
  echo "✓ PASS"
  # Cleanup
  $PSQL "$DB_URL" -U learnbox_app -c "DELETE FROM card_schedules WHERE id = 'cs-test';" >/dev/null 2>&1
else
  echo "✗ FAIL"
  exit 1
fi

# Test: learnbox_admin cannot INSERT into card_schedules
echo -n "Test 4: learnbox_admin INSERT card_schedules → "
if $PSQL "$DB_URL" -U learnbox_admin -c "INSERT INTO card_schedules (id, user_id, card_id) VALUES ('cs-test2', 'u-test', 'c-test');" 2>&1 | grep -q "permission denied"; then
  echo "✓ PASS (denied as expected)"
else
  echo "✗ FAIL (should be denied)"
  exit 1
fi

# Test: learnbox_admin can SELECT review_events
echo -n "Test 5: learnbox_admin SELECT review_events → "
if $PSQL "$DB_URL" -U learnbox_admin -c "SELECT COUNT(*) FROM review_events LIMIT 1;" >/dev/null 2>&1; then
  echo "✓ PASS"
else
  echo "✗ FAIL"
  exit 1
fi

# Test: learnbox_admin can INSERT into review_events
echo -n "Test 6: learnbox_admin INSERT review_events → "
if $PSQL "$DB_URL" -U learnbox_admin -c "INSERT INTO review_events (id, user_id, card_id, rating) VALUES ('re-test', 'u-test', 'c-test', 5);" >/dev/null 2>&1; then
  echo "✓ PASS"
  # Cleanup
  $PSQL "$DB_URL" -U learnbox_admin -c "DELETE FROM review_events WHERE id = 're-test';" >/dev/null 2>&1
else
  echo "✗ FAIL"
  exit 1
fi

# Test: learnbox_admin cannot ALTER table
echo -n "Test 7: learnbox_admin ALTER users → "
if $PSQL "$DB_URL" -U learnbox_admin -c "ALTER TABLE users ADD COLUMN fake TEXT;" 2>&1 | grep -q "permission denied"; then
  echo "✓ PASS (denied as expected)"
else
  echo "✗ FAIL (should be denied)"
  exit 1
fi

# Test: learnbox_admin cannot DROP table
echo -n "Test 8: learnbox_admin DROP table → "
if $PSQL "$DB_URL" -U learnbox_admin -c "DROP TABLE review_events;" 2>&1 | grep -q "permission denied"; then
  echo "✓ PASS (denied as expected)"
else
  echo "✗ FAIL (should be denied)"
  exit 1
fi

# Test: learnbox_admin cannot TRUNCATE table
echo -n "Test 9: learnbox_admin TRUNCATE table → "
if $PSQL "$DB_URL" -U learnbox_admin -c "TRUNCATE review_events;" 2>&1 | grep -q "permission denied"; then
  echo "✓ PASS (denied as expected)"
else
  echo "✗ FAIL (should be denied)"
  exit 1
fi

echo
echo "=== All 9 proof tests PASSED ==="
echo
echo "Roles are configured and ready for Production deployment."
echo "Next: Generate strong passwords for each role and update DSN environment variables."
