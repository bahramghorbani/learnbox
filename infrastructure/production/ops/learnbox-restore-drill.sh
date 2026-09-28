#!/usr/bin/env bash
# LearnBox restore drill (LB-B01).
#
# Proves a backup archive is actually restorable by loading it into a DISPOSABLE local Postgres
# container and verifying the restored schema and row counts.
#
# SAFETY: this script can only ever write to a throwaway container database created for the drill.
# It never accepts a remote target, never reads DATABASE_URL, and the scratch container is removed
# on exit. Production is not touched in any code path.
set -euo pipefail

BACKUP_DIR="${LEARNBOX_BACKUP_DIR:-/home/ubuntu/learnbox/backups}"
PG_IMAGE="${LEARNBOX_PG_IMAGE:-postgres:17-alpine}"
STATE_DIR="${LEARNBOX_MONITOR_STATE_DIR:-/home/ubuntu/learnbox/ops/state}"
ALERT_BIN="${LEARNBOX_ALERT_BIN:-/home/ubuntu/learnbox/ops/learnbox-alert.sh}"
SCRATCH="lb-restore-drill-$$"
DRILL_PASSWORD="drill-$(head -c 12 /dev/urandom | od -An -tx1 | tr -d ' \n')"

mkdir -p "$STATE_DIR"
status_file="$STATE_DIR/restore-drill.status"

archive="${1:-}"
if [ -z "$archive" ]; then
  archive="$(ls -1t "$BACKUP_DIR"/learnbox-*.sql.gz 2>/dev/null | head -1 || true)"
fi
[ -n "$archive" ] && [ -f "$archive" ] || { echo "restore-drill: no backup archive found" >&2; exit 1; }

cleanup() { docker rm -f "$SCRATCH" >/dev/null 2>&1 || true; }
trap cleanup EXIT

fail() {
  local reason="$1"
  printf 'status=failed\nat=%s\narchive=%s\nreason=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(basename "$archive")" "$reason" > "$status_file"
  echo "restore-drill: FAILED — $reason" >&2
  [ -x "$ALERT_BIN" ] && "$ALERT_BIN" critical "Restore drill failed" "$reason" || true
  exit 1
}

echo "restore-drill: target archive $(basename "$archive")"

# Isolated scratch database. No published ports: reachable only via docker exec.
docker run -d --rm --name "$SCRATCH" \
  -e POSTGRES_PASSWORD="$DRILL_PASSWORD" \
  -e POSTGRES_DB=drill \
  "$PG_IMAGE" >/dev/null 2>&1 || fail "could not start scratch postgres container"

ready=0
for _ in $(seq 1 45); do
  if docker exec "$SCRATCH" pg_isready -U postgres -d drill >/dev/null 2>&1; then ready=1; break; fi
  sleep 2
done
[ "$ready" = 1 ] || fail "scratch postgres did not become ready"

# Restore. ON_ERROR_STOP makes any failed statement fail the drill loudly.
if ! gzip -dc "$archive" | docker exec -i "$SCRATCH" \
  psql -v ON_ERROR_STOP=1 -U postgres -d drill >/tmp/lb-restore-out.$$ 2>/tmp/lb-restore-err.$$; then
  err="$(tail -c 300 /tmp/lb-restore-err.$$ 2>/dev/null | tr -d '\n' || true)"
  rm -f /tmp/lb-restore-out.$$ /tmp/lb-restore-err.$$
  fail "psql restore aborted: ${err}"
fi
rm -f /tmp/lb-restore-out.$$ /tmp/lb-restore-err.$$

q() { docker exec "$SCRATCH" psql -U postgres -d drill -tAc "$1" 2>/dev/null | tr -d ' \n'; }

restored_tables="$(q "select count(*) from information_schema.tables where table_schema='public'")"
[ "${restored_tables:-0}" -ge 10 ] || fail "restored only ${restored_tables} tables"

# Integrity spot-checks on tables that must survive any real restore.
users_rows="$(q "select count(*) from users")"
cards_rows="$(q "select count(*) from cards")"
reviews_rows="$(q "select count(*) from review_events")"
migrations="$(q "select count(*) from schema_migrations")"
purchases="$(q "select count(*) from purchase_events")"

[ "${cards_rows:-0}" -ge 1 ] || fail "restored cards table is empty"
[ "${migrations:-0}" -ge 1 ] || fail "restored schema_migrations is empty"

# Referential sanity: the restore must not have orphaned learner rows.
orphans="$(q "select count(*) from card_schedules s left join users u on u.id=s.user_id where u.id is null")"
[ "${orphans:-0}" = "0" ] || fail "restored data has ${orphans} orphaned card_schedules rows"

cat > "$status_file" <<EOF
status=ok
at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
archive=$(basename "$archive")
archive_sha256=$(sha256sum "$archive" | cut -d' ' -f1)
restored_tables=$restored_tables
users=$users_rows
cards=$cards_rows
review_events=$reviews_rows
purchase_events=$purchases
schema_migrations=$migrations
orphaned_rows=0
target=disposable-container-only
production_touched=no
EOF

echo "restore-drill: ok tables=$restored_tables users=$users_rows cards=$cards_rows reviews=$reviews_rows migrations=$migrations"
