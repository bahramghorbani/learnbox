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
#  - A failure reports WHY. The first version swallowed pg_dump's stderr and alerted with a fixed
#    "pg_dump did not complete", which is why a single missing SELECT privilege on one sequence
#    went undiagnosed for seven consecutive nights (2026-10-03 .. 2026-10-09). The reason is now
#    carried into both the status file and the alert, after sanitising anything that could leak a
#    credential — the error text comes from a process that was handed a DSN.
set -euo pipefail

# Diagnostic capture files may contain connection strings; never create them world-readable.
umask 077

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

# LB-B30: the learner runs as least-privilege learnbox_app, which cannot dump the whole database.
# Prefer the dedicated migrator credential (full read for pg_dump) from the mode-600 secrets file;
# fall back to the legacy DATABASE_URL so the job still works before the credential cutover.
ROLES_ENV="${LEARNBOX_ROLES_ENV:-/home/ubuntu/learnbox/secrets/db-roles.env}"
PGURL="$(grep -E '^LEARNBOX_MIGRATOR_DATABASE_URL=' "$ROLES_ENV" 2>/dev/null | cut -d= -f2- || true)"
[ -n "$PGURL" ] || PGURL="$(grep -E '^DATABASE_URL=' "$APP_DIR/.env" 2>/dev/null | cut -d= -f2- || true)"
[ -n "$PGURL" ] || fail "no database URL readable from $ROLES_ENV or $APP_DIR/.env"

# Turn a raw pg_dump/psql diagnostic into something safe to put in an alert: one line, bounded
# length, and with every shape that can carry a secret removed. Credentials reach this script only
# inside a DSN, so the DSN forms are what must go; table, column and sequence names — the part that
# actually identifies the fault — are preserved verbatim.
sanitize_error() {
  sed -E \
    -e 's#(postgres(ql)?://)[^[:space:]"]*#\1[redacted]#g' \
    -e 's#(password|PGPASSWORD)=[^[:space:]&"]*#\1=[redacted]#Ig' \
    -e 's#npg_[A-Za-z0-9_]+#[redacted]#g' \
    | tr -d '\r' \
    | tr '\n' ' ' \
    | sed -E 's/[[:cntrl:]]/ /g; s/  +/ /g; s/^ //; s/ $//' \
    | cut -c1-400 \
    | tr -d '\n'
}

PG_IMAGE="${LEARNBOX_PG_IMAGE:-postgres:17-alpine}"

# pg_dump runs in a throwaway client container; only the compressed stream crosses to the host.
if ! docker run --rm -i -e PGURL="$PGURL" "$PG_IMAGE" \
  sh -c 'pg_dump --no-owner --no-privileges --format=plain "$PGURL"' 2>/tmp/lb-backup-err.$$ | gzip -9 > "$target"; then
  err="$(sanitize_error < /tmp/lb-backup-err.$$ 2>/dev/null || true)"
  rm -f /tmp/lb-backup-err.$$ "$target"
  fail "pg_dump did not complete: ${err:-no diagnostic output captured}"
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
