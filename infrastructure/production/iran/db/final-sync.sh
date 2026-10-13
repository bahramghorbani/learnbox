#!/usr/bin/env bash
# LearnBox Neon -> Iran self-hosted PostgreSQL final sync. Runs ON THE IRAN HOST as `ubuntu`.
#
#   final-sync.sh rehearsal   # Neon stays live; proves timing and parity. Apps on Iran restart.
#   final-sync.sh cutover     # same steps; refuses to run unless Germany writes are frozen
#                             # (operator sets LEARNBOX_WRITES_FROZEN=yes after the 503 switch).
#
# Neon is only ever READ: pg_dump plus one READ ONLY parity transaction. The only database this
# script drops is `neondb` inside the local container `learnbox-db-postgres-1`, via docker exec.
# Any parity difference aborts with the Iran apps left STOPPED (Germany/Neon stays the live path).
set -euo pipefail
umask 077

MODE="${1:-}"
case "$MODE" in rehearsal|cutover) ;; *) echo "usage: $0 rehearsal|cutover" >&2; exit 2;; esac
if [ "$MODE" = cutover ] && [ "${LEARNBOX_WRITES_FROZEN:-}" != yes ]; then
  echo "cutover refused: freeze Germany app/admin writes first, then LEARNBOX_WRITES_FROZEN=yes" >&2; exit 3
fi

L=/home/ubuntu/learnbox
HERE="$(cd "$(dirname "$0")" && pwd)"
DB=learnbox-db-postgres-1
PG_IMAGE=postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24
OUT="$L/backups/$MODE"; mkdir -p "$OUT"; chmod 700 "$OUT"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"; DUMP="neon-$STAMP.dump"
t0=$(date +%s); lap() { echo "[$(( $(date +%s) - t0 ))s] $*"; }
redact() { sed -E 's#postgres(ql)?://[^[:space:]]*#[redacted]#g'; }

set -a; . "$L/secrets/neon-source.env"; set +a
case "$NEON_SOURCE_DATABASE_URL" in *.neon.tech/*) ;; *) echo "source is not Neon; abort" >&2; exit 4;; esac
SRC="$(printf '%s' "$NEON_SOURCE_DATABASE_URL" | sed -E 's/[?&]sslmode=[a-z-]+//')"
case "$SRC" in *\?*) SRC="$SRC&sslmode=verify-full&sslrootcert=system";; *) SRC="$SRC?sslmode=verify-full&sslrootcert=system";; esac

lap "dump Neon -> $OUT/$DUMP"
docker run --rm --user "$(id -u):$(id -g)" -e PGURL="$SRC" -v "$OUT:/out" "$PG_IMAGE" \
  sh -c "pg_dump \"\$PGURL\" --format=custom --compress=9 --serializable-deferrable --file=/out/$DUMP" 2>&1 | redact
(cd "$OUT" && chmod 600 "$DUMP" && sha256sum "$DUMP" > "$DUMP.sha256" && cat "$DUMP.sha256")

lap "stop Iran app/admin"
(cd "$L/app" && docker compose stop) >/dev/null 2>&1
(cd "$L/admin" && docker compose stop) >/dev/null 2>&1

lap "recreate local neondb (builtin C.UTF-8, same as Neon) and restore"
docker exec -i "$DB" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'neondb' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS neondb;
CREATE DATABASE neondb OWNER neondb_owner TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8' LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8';
REVOKE ALL ON DATABASE neondb FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE neondb TO learnbox_app, learnbox_admin, learnbox_migrator;
ALTER ROLE neondb_owner BYPASSRLS;
SQL
docker cp "$OUT/$DUMP" "$DB:/tmp/a.dump"
# Neon platform role `cloud_admin` does not exist here; its default-ACL entries are the only skipped items.
docker exec "$DB" sh -ec 'pg_restore -l /tmp/a.dump | grep -vE "DEFAULT ACL public .*cloud_admin" > /tmp/toc.list
  pg_restore -U postgres -d neondb --exit-on-error --single-transaction -L /tmp/toc.list /tmp/a.dump
  psql -X -q -U postgres -d neondb -c "VACUUM ANALYZE"; rm -f /tmp/a.dump /tmp/toc.list'

lap "parity: Neon (read-only) vs Iran"
W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
docker run --rm -e PGURL="$SRC" -v "$HERE/parity.sql:/q.sql:ro" "$PG_IMAGE" \
  sh -c 'psql "$PGURL" -X -v ON_ERROR_STOP=1 -f /q.sql' > "$W/neon.txt"
docker exec -i "$DB" psql -U postgres -d neondb -X -v ON_ERROR_STOP=1 -f - < "$HERE/parity.sql" > "$W/iran.txt"
# pgcrypto's functions are owned by cloud_admin on Neon (filtered in parity.sql) and by postgres here.
grep -v '|proacl|postgres|-$' "$W/iran.txt" > "$W/iran.cmp"
cp "$W/neon.txt" "$OUT/parity-neon-$STAMP.txt"; cp "$W/iran.txt" "$OUT/parity-iran-$STAMP.txt"
if ! diff -q "$W/neon.txt" "$W/iran.cmp" >/dev/null; then
  diff "$W/neon.txt" "$W/iran.cmp" | head -20
  lap "PARITY FAILED - Iran apps left stopped; Germany/Neon remains the live path"; exit 5
fi
lap "parity OK: $(awk -F'|' '$2=="rows"{n++;s+=$3} END{print n" tables, "s" rows"}' "$W/iran.txt"), $(grep -c . "$W/iran.txt") checks identical"

lap "start Iran app/admin"
(cd "$L/app" && docker compose up -d) >/dev/null 2>&1
(cd "$L/admin" && docker compose up -d) >/dev/null 2>&1
for _ in $(seq 1 40); do
  a="$(docker inspect learnbox-app-production-app-1 --format '{{.State.Health.Status}}')"
  b="$(docker inspect learnbox-admin-production-admin-1 --format '{{.State.Health.Status}}')"
  [ "$a/$b" = healthy/healthy ] && break; sleep 3
done
[ "$a/$b" = healthy/healthy ] || { lap "apps not healthy ($a/$b)"; exit 6; }
# Caddy's active upstream health check (30s interval) can still mark the restarted app down briefly.
h=""
for _ in $(seq 1 30); do
  h="$(curl -sS -m 10 --resolve app.learnboxapp.com:443:127.0.0.1 https://app.learnboxapp.com/api/health 2>&1 || true)"
  case "$h" in *'"state":"ok"'*) break;; esac; sleep 3
done
case "$h" in *'"state":"ok"'*) lap "Iran health: $h";; *) lap "health FAILED: $h"; exit 7;; esac
lap "final sync $MODE complete (data window = Neon state at dump start)"
