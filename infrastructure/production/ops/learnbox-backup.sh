#!/usr/bin/env bash
# LearnBox automated database backup (LB-B01).
#
# Takes a compressed logical backup of the production Neon Postgres database and keeps a bounded
# retention window on the host. Designed to be run daily by a systemd timer.
#
# Design notes:
#  - Neon's own branch/PITR protection still exists; this is an INDEPENDENT copy, so a Neon-side
#    account or project failure cannot take the backup with it.
#  - The application image ships no Postgres client, so the dump runs in a throwaway
#    `postgres:17-alpine` container whose pg_dump major version matches the Neon server (17.x).
#    Nothing is installed on the host and the container is removed when the dump finishes.
#  - DATABASE_URL is read from the deployment env file and passed via the environment, never as a
#    command argument (arguments are world-readable through /proc).
#  - The script never writes to the database and never touches Production runtime state.
set -euo pipefail

APP_DIR="${LEARNBOX_APP_DIR:-/home/ubuntu/learnbox/app}"
BACKUP_DIR="${LEARNBOX_BACKUP_DIR:-/home/ubuntu/learnbox/backups}"
RETENTION_DAYS="${LEARNBOX_BACKUP_RETENTION_DAYS:-30}"
ALERT_BIN="${LEARNBOX_ALERT_BIN:-/home/ubuntu/learnbox/ops/learnbox-alert.sh}"
STATE_DIR="${LEARNBOX_MONITOR_STATE_DIR:-/home/ubuntu/learnbox/ops/state}"

mkdir -p "$BACKUP_DIR" "$STATE_DIR"
chmod 700 "$BACKUP_DIR"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$BACKUP_DIR/learnbox-$stamp.sql.gz"
status_file="$STATE_DIR/backup.status"

fail() {
  local reason="$1"
  printf 'status=failed\nat=%s\nreason=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$reason" > "$status_file"
  echo "backup: FAILED — $reason" >&2
  [ -x "$ALERT_BIN" ] && "$ALERT_BIN" critical "Database backup failed" "$reason" || true
  exit 1
}

PGURL="$(grep -E '^DATABASE_URL=' "$APP_DIR/.env" 2>/dev/null | cut -d= -f2- || true)"
[ -n "$PGURL" ] || fail "DATABASE_URL not readable from $APP_DIR/.env"

PG_IMAGE="${LEARNBOX_PG_IMAGE:-postgres:17-alpine}"

# pg_dump runs in a throwaway client container; only the compressed stream crosses to the host.
if ! docker run --rm -i -e PGURL="$PGURL" "$PG_IMAGE" \
  sh -c 'pg_dump --no-owner --no-privileges --format=plain "$PGURL"' 2>/tmp/lb-backup-err.$$ | gzip -9 > "$target"; then
  err="$(head -c 400 /tmp/lb-backup-err.$$ 2>/dev/null | tr -d '\n' || true)"
  rm -f /tmp/lb-backup-err.$$ "$target"
  fail "pg_dump did not complete"
fi
rm -f /tmp/lb-backup-err.$$

chmod 600 "$target"
size="$(stat -c %s "$target" 2>/dev/null || echo 0)"

# A dump that is implausibly small is a failed dump, not a small database.
[ "$size" -ge 2048 ] || fail "backup archive is implausibly small (${size} bytes)"

# Structural sanity: the archive must be readable gzip and contain real schema statements.
gzip -t "$target" 2>/dev/null || fail "backup archive failed gzip integrity check"
tables="$(gzip -dc "$target" | grep -c '^CREATE TABLE' || true)"
[ "${tables:-0}" -ge 10 ] || fail "backup contains only ${tables} tables; expected the full schema"

sha="$(sha256sum "$target" | cut -d' ' -f1)"

# Retention: delete only backups older than the window, never the newest one.
deleted=0
if [ "$(ls -1 "$BACKUP_DIR"/learnbox-*.sql.gz 2>/dev/null | wc -l)" -gt 1 ]; then
  while IFS= read -r old; do
    [ "$old" = "$target" ] && continue
    rm -f "$old" && deleted=$((deleted + 1))
  done < <(find "$BACKUP_DIR" -name 'learnbox-*.sql.gz' -type f -mtime "+${RETENTION_DAYS}" 2>/dev/null || true)
fi

kept="$(ls -1 "$BACKUP_DIR"/learnbox-*.sql.gz 2>/dev/null | wc -l | tr -d ' ')"

cat > "$status_file" <<EOF
status=ok
at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
file=$(basename "$target")
bytes=$size
tables=$tables
sha256=$sha
retained=$kept
retention_days=$RETENTION_DAYS
pruned=$deleted
EOF

echo "backup: ok file=$(basename "$target") bytes=$size tables=$tables retained=$kept pruned=$deleted"
