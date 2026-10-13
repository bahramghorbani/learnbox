#!/usr/bin/env bash
# LearnBox rollback Iran -> Neon WITHOUT losing post-cutover data. Runs ON THE IRAN HOST as `ubuntu`.
#
#   rollback-to-neon.sh drift-check   # read-only: has Neon changed since the cutover snapshot?
#   rollback-to-neon.sh rehearsal     # Iran data -> disposable Neon-like container; parity. Touches nothing live.
#   rollback-to-neon.sh execute       # Iran data -> Neon (replace). Needs ALL of:
#       LEARNBOX_IRAN_WRITES_FROZEN=yes   Iran app/admin already 503 (Caddyfile.maintenance on Iran)
#       LEARNBOX_ROLLBACK_APPROVED=yes    explicit owner approval for this run
#       NEON_OWNER_DATABASE_URL=...       neondb_owner DSN for the Neon branch to overwrite, supplied in the
#                                         environment only (owner secure path / neon CLI); never stored.
#     and a Neon backup branch of the target created first (runbook R2 step 2).
#
# Why a full replace is lossless: after the cutover Neon received no writes (Germany frozen), so
# Iran's data is a superset of Neon's. drift-check proves that before anything is overwritten.
set -euo pipefail
umask 077

MODE="${1:-}"
case "$MODE" in drift-check|rehearsal|execute) ;; *) echo "usage: $0 drift-check|rehearsal|execute" >&2; exit 2;; esac

L=/home/ubuntu/learnbox
HERE="$(cd "$(dirname "$0")" && pwd)"
DB=learnbox-db-postgres-1
PG_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24
CUT="$L/backups/cutover"
CUT_PARITY="$(ls -1 "$CUT"/parity-neon-*.txt | tail -1)"
CUT_DUMP="$(ls -1 "$CUT"/neon-*.dump | tail -1)"
OUT="$L/backups/rollback"; mkdir -p "$OUT"; chmod 700 "$OUT"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
W="$(mktemp -d)"; trap 'rm -rf "$W"; docker rm -f lb-rollback-rehearsal >/dev/null 2>&1 || true' EXIT
t0=$(date +%s); lap() { echo "[$(( $(date +%s) - t0 ))s] $*"; }
verify_full() { local u; u="$(printf '%s' "$1" | sed -E 's/[?&]sslmode=[a-z-]+//')"
  case "$u" in *\?*) echo "$u&sslmode=verify-full&sslrootcert=system";; *) echo "$u?sslmode=verify-full&sslrootcert=system";; esac; }
# TOC skip-list used below: Neon platform objects that neondb_owner neither owns nor may recreate
# (pgcrypto + its comment, public-schema ACL, cloud_admin default ACLs).
# Compare parity outputs; ACL item ORDER inside {...} is not semantic (depends on GRANT replay order).
norm() { grep -v '|proacl|postgres|-$' "$1" | python3 -c 'import re,sys
for l in sys.stdin: sys.stdout.write(re.sub(r"\{([^}]*)\}", lambda m: "{"+",".join(sorted(m.group(1).split(",")))+"}", l))'; }
same() { norm "$1" > "$W/a"; norm "$2" > "$W/b"; diff "$W/a" "$W/b" > "$W/d" && return 0; head -20 "$W/d"; return 1; }

neon_drift_check() {
  set -a; . "$L/secrets/neon-source.env"; set +a
  docker run --rm -e PGURL="$(verify_full "$NEON_SOURCE_DATABASE_URL")" -v "$HERE/parity.sql:/q.sql:ro" "$PG_IMAGE" \
    sh -c 'psql "$PGURL" -X -v ON_ERROR_STOP=1 -f /q.sql' > "$W/neon-now.txt"
  cp "$W/neon-now.txt" "$OUT/neon-now-$STAMP.txt"
  if diff -q "$CUT_PARITY" "$W/neon-now.txt" >/dev/null; then
    lap "Neon UNCHANGED since cutover ($(basename "$CUT_PARITY")): full replace from Iran loses nothing"
  else
    diff "$CUT_PARITY" "$W/neon-now.txt" | head -10
    lap "Neon CHANGED since cutover - stop: those rows exist only on Neon and need a manual merge"; return 1
  fi
}

dump_iran() {
  lap "dump Iran -> $OUT/iran-$STAMP.dump"
  docker exec "$DB" pg_dump -U postgres -d neondb --format=custom --compress=9 > "$OUT/iran-$STAMP.dump"
  chmod 600 "$OUT/iran-$STAMP.dump"; (cd "$OUT" && sha256sum "iran-$STAMP.dump" > "iran-$STAMP.dump.sha256")
  docker exec -i "$DB" psql -U postgres -d neondb -X -v ON_ERROR_STOP=1 -f - < "$HERE/parity.sql" > "$W/iran.txt"
}

restore_as_owner() {  # $1 = owner DSN (docker env), $2 = extra docker args
  docker run --rm $2 -e PGURL="$1" -v "$OUT/iran-$STAMP.dump:/a.dump:ro" "$PG_IMAGE" sh -ec '
    pg_restore -l /a.dump | grep -vE "EXTENSION - pgcrypto|COMMENT - EXTENSION pgcrypto|ACL - SCHEMA public|DEFAULT ACL public .*cloud_admin" > /tmp/toc
    pg_restore -d "$PGURL" --clean --if-exists --single-transaction --exit-on-error -L /tmp/toc /a.dump'
}

case "$MODE" in
drift-check)
  neon_drift_check ;;

rehearsal)
  neon_drift_check || true
  dump_iran
  lap "disposable Neon-like target (cloud_admin owns pgcrypto, neondb_owner non-superuser) seeded with the cutover Neon dump"
  docker run -d --name lb-rollback-rehearsal --network none -e POSTGRES_PASSWORD="$(openssl rand -hex 16)" "$PG_IMAGE" >/dev/null
  for _ in $(seq 1 30); do docker exec lb-rollback-rehearsal pg_isready -U postgres -q 2>/dev/null && break; sleep 1; done; sleep 2
  docker exec -i lb-rollback-rehearsal psql -X -q -v ON_ERROR_STOP=1 -U postgres <<'SQL'
CREATE ROLE cloud_admin SUPERUSER LOGIN;
CREATE ROLE neon_superuser NOLOGIN CREATEDB CREATEROLE BYPASSRLS;
CREATE ROLE neondb_owner LOGIN CREATEDB CREATEROLE BYPASSRLS PASSWORD 'rehearsal' IN ROLE neon_superuser;
CREATE ROLE learnbox_app LOGIN NOINHERIT; CREATE ROLE learnbox_admin LOGIN NOINHERIT; CREATE ROLE learnbox_migrator LOGIN NOINHERIT;
GRANT learnbox_app, learnbox_admin, learnbox_migrator TO neondb_owner;
CREATE DATABASE neondb OWNER neondb_owner TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8' LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8';
\c neondb cloud_admin
CREATE EXTENSION pgcrypto;
SQL
  docker cp "$CUT_DUMP" lb-rollback-rehearsal:/tmp/seed.dump
  docker exec lb-rollback-rehearsal sh -ec 'pg_restore -l /tmp/seed.dump | grep -vE "EXTENSION - pgcrypto|COMMENT - EXTENSION pgcrypto" > /tmp/seed.toc
    pg_restore -U postgres -d neondb --exit-on-error --single-transaction -L /tmp/seed.toc /tmp/seed.dump'
  docker exec -i lb-rollback-rehearsal psql -U postgres -d neondb -X -v ON_ERROR_STOP=1 -f - < "$HERE/parity.sql" > "$W/seed.txt"
  same "$CUT_PARITY" "$W/seed.txt" && lap "target seeded = Neon at cutover" || { diff "$CUT_PARITY" "$W/seed.txt" | head -20; lap "seed mismatch"; exit 5; }
  lap "restore Iran dump into target AS neondb_owner (--clean, single transaction)"
  docker cp "$OUT/iran-$STAMP.dump" lb-rollback-rehearsal:/tmp/iran.dump
  docker exec lb-rollback-rehearsal sh -ec 'pg_restore -l /tmp/iran.dump | grep -vE "EXTENSION - pgcrypto|COMMENT - EXTENSION pgcrypto|ACL - SCHEMA public|DEFAULT ACL public .*cloud_admin" > /tmp/toc
    pg_restore -U neondb_owner -d neondb --clean --if-exists --single-transaction --exit-on-error -L /tmp/toc /tmp/iran.dump'
  docker exec -i lb-rollback-rehearsal psql -U postgres -d neondb -X -v ON_ERROR_STOP=1 -f - < "$HERE/parity.sql" > "$W/target.txt"
  cp "$W/target.txt" "$OUT/rehearsal-target-$STAMP.txt"
  if same "$W/iran.txt" "$W/target.txt"; then
    lap "REHEARSAL OK: target == Iran ($(awk -F'|' '$2=="rows"{n++;s+=$3} END{print n" tables, "s" rows"}' "$W/iran.txt"), $(grep -c . "$W/iran.txt") checks)"
  else diff "$W/iran.txt" "$W/target.txt" | head -20; lap "REHEARSAL PARITY FAILED"; exit 6; fi
  rm -f "$OUT/iran-$STAMP.dump" "$OUT/iran-$STAMP.dump.sha256" ;;

execute)
  [ "${LEARNBOX_IRAN_WRITES_FROZEN:-}" = yes ] || { echo "refused: freeze Iran writes first" >&2; exit 3; }
  [ "${LEARNBOX_ROLLBACK_APPROVED:-}" = yes ] || { echo "refused: owner approval flag missing" >&2; exit 3; }
  [ -n "${NEON_OWNER_DATABASE_URL:-}" ] || { echo "refused: NEON_OWNER_DATABASE_URL not in environment" >&2; exit 3; }
  case "$NEON_OWNER_DATABASE_URL" in *://neondb_owner:*.neon.tech/*) ;; *) echo "refused: target must be neondb_owner on Neon" >&2; exit 4;; esac
  neon_drift_check
  lap "safety dump of Neon before overwrite -> $OUT/neon-before-$STAMP.dump"
  docker run --rm -e PGURL="$(verify_full "$NEON_SOURCE_DATABASE_URL")" "$PG_IMAGE" \
    sh -c 'pg_dump "$PGURL" --format=custom --compress=9 --no-owner' > "$OUT/neon-before-$STAMP.dump"
  chmod 600 "$OUT/neon-before-$STAMP.dump"
  dump_iran
  T="$(verify_full "$NEON_OWNER_DATABASE_URL")"
  lap "restore Iran -> Neon as neondb_owner"
  restore_as_owner "$T" ""
  docker run --rm -e PGURL="$T" -v "$HERE/parity.sql:/q.sql:ro" "$PG_IMAGE" sh -c 'psql "$PGURL" -X -v ON_ERROR_STOP=1 -f /q.sql' > "$W/neon-after.txt"
  cp "$W/neon-after.txt" "$OUT/neon-after-$STAMP.txt"
  if same "$W/iran.txt" "$W/neon-after.txt"; then lap "ROLLBACK DATA OK: Neon == Iran. Next: unfreeze Germany, Arvan origin -> Germany."
  else diff "$W/iran.txt" "$W/neon-after.txt" | head -20; lap "PARITY FAILED - keep Iran live (unfreeze Iran), restore Neon from the backup branch"; exit 6; fi ;;
esac
