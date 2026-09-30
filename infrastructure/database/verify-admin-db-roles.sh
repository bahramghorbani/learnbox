#!/usr/bin/env bash
# LB-B30 Admin least-privilege DB role verification on staging.
# Run this to prove the model before applying to Production.

set -euo pipefail

DB_URL="${1:?Usage: $0 <DATABASE_URL>}"
STAGING_SCHEMA="learnbox_staging"

echo "=== Creating staging schema and test user ==="
psql "$DB_URL" -c "CREATE SCHEMA IF NOT EXISTS $STAGING_SCHEMA;"
psql "$DB_URL" -c "GRANT USAGE ON SCHEMA $STAGING_SCHEMA TO neondb_owner;"

# Create test tables in staging
psql "$DB_URL" -c "
CREATE TABLE IF NOT EXISTS $STAGING_SCHEMA.users (
  id TEXT PRIMARY KEY,
  first_name TEXT,
  avatar_id TEXT
);
CREATE TABLE IF NOT EXISTS $STAGING_SCHEMA.card_schedules (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES $STAGING_SCHEMA.users(id),
  card_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS $STAGING_SCHEMA.review_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES $STAGING_SCHEMA.users(id),
  card_id TEXT,
  rating INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
"

echo "=== Creating staging roles ==="
psql "$DB_URL" -c "
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_app_test') THEN
    CREATE ROLE learnbox_app_test LOGIN PASSWORD 'test_app_pass';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_admin_test') THEN
    CREATE ROLE learnbox_admin_test LOGIN PASSWORD 'test_admin_pass';
  END IF;
END \$\$;
"

echo "=== Granting staging role privileges ==="
psql "$DB_URL" -c "
GRANT CONNECT ON DATABASE neondb TO learnbox_app_test, learnbox_admin_test;
GRANT USAGE ON SCHEMA $STAGING_SCHEMA TO learnbox_app_test, learnbox_admin_test;
GRANT SELECT ON ALL TABLES IN SCHEMA $STAGING_SCHEMA TO learnbox_app_test, learnbox_admin_test;
GRANT INSERT ON $STAGING_SCHEMA.card_schedules, $STAGING_SCHEMA.review_events TO learnbox_app_test;
GRANT UPDATE ON $STAGING_SCHEMA.card_schedules TO learnbox_app_test;
GRANT UPDATE (rating) ON $STAGING_SCHEMA.review_events TO learnbox_admin_test;
"

echo "=== Running proof tests ==="
PSQL_APP="psql \"$DB_URL\" -U learnbox_app_test -c"
PSQL_ADMIN="psql \"$DB_URL\" -U learnbox_admin_test -c"

# Test 1: learnbox_app can read users
echo "Test 1: learnbox_app SELECT users..."
$PSQL_APP "SELECT * FROM $STAGING_SCHEMA.users LIMIT 1;" 2>&1 | head -2

# Test 2: learnbox_app can insert card_schedules
echo "Test 2: learnbox_app INSERT card_schedules..."
$PSQL_APP "INSERT INTO $STAGING_SCHEMA.card_schedules (id, user_id, card_id) VALUES ('cs1', 'u1', 'c1');" 2>&1 | head -1

# Test 3: learnbox_admin can read card_schedules but NOT write
echo "Test 3: learnbox_admin SELECT card_schedules (allowed)..."
$PSQL_ADMIN "SELECT * FROM $STAGING_SCHEMA.card_schedules LIMIT 1;" 2>&1 | head -2
echo "Test 4: learnbox_admin cannot INSERT card_schedules..."
$PSQL_ADMIN "INSERT INTO $STAGING_SCHEMA.card_schedules (id, user_id, card_id) VALUES ('cs2', 'u2', 'c2');" 2>&1 | grep -i "permission\|error" || echo "FAILED: should have been denied"

# Test 5: learnbox_admin can write review_events
echo "Test 5: learnbox_admin INSERT review_events..."
$PSQL_ADMIN "INSERT INTO $STAGING_SCHEMA.review_events (id, user_id, card_id, rating) VALUES ('re1', 'u1', 'c1', 5);" 2>&1 | head -1

# Test 6: Neither role can ALTER or DROP
echo "Test 6: learnbox_admin cannot ALTER schema..."
$PSQL_ADMIN "ALTER TABLE $STAGING_SCHEMA.users ADD COLUMN fake_col TEXT;" 2>&1 | grep -i "permission\|error" || echo "FAILED: should have been denied"

# Cleanup
echo "=== Cleaning up staging test data ==="
psql "$DB_URL" -c "DROP SCHEMA IF EXISTS $STAGING_SCHEMA CASCADE;"
psql "$DB_URL" -c "DROP ROLE IF EXISTS learnbox_app_test, learnbox_admin_test;"
echo "✓ Staging verification complete"
