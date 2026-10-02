#!/usr/bin/env bash
# LB-B35 CP9 Stage 2.75 -- graceful shutdown / in-flight review safety proof. STAGING ONLY.
#
# Owner PASS criteria (all must hold):
#   1. every submitted review is either persisted exactly once OR remains client-side queued
#   2. zero duplicate review rows
#   3. zero lost acknowledged reviews
#   4. zero partial writes
#   5. graceful SIGTERM exit within the configured/default grace period
#   6. no SIGKILL
#
# Method: drive continuous review writes against the disposable staging Postgres through the SAME
# store the application uses, SIGTERM the writer mid-flight, then reconcile what the client believes
# it got acknowledged against what the database actually holds.
#
# Refuses to run against anything but the disposable staging DB on port 55443.
set -uo pipefail

REPO="${REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$REPO" || exit 2

# shellcheck disable=SC1090
eval "$(grep '^export STAGING_DATABASE_URL=' tools/cp8/cp9-probe-run.sh)"
export STAGING_DATABASE_URL
case "${STAGING_DATABASE_URL:-}" in
  *55443*) : ;;
  *) echo "REFUSED: Stage 2.75 proof runs only against the staging DB on port 55443."; exit 2 ;;
esac

OUT="${1:-${TMPDIR:-/tmp}/cp9-stage275}"
mkdir -p "$OUT"
ACK="$OUT/acknowledged.jsonl"
: > "$ACK"

echo "=== Stage 2.75: starting writer ==="
ACK_LOG="$ACK" node tools/cp8/cp9-stage275-writer.mjs &
WRITER=$!

# Let real writes accumulate so the signal genuinely lands mid-flight.
sleep 6

echo "=== Stage 2.75: sending SIGTERM to writer (pid $WRITER) ==="
START=$(date +%s)
kill -TERM "$WRITER" 2>/dev/null

GRACE=10          # Docker's default stop_grace_period, the value we must live within
KILLED=no
for _ in $(seq 1 "$GRACE"); do
  kill -0 "$WRITER" 2>/dev/null || break
  sleep 1
done
if kill -0 "$WRITER" 2>/dev/null; then
  echo "writer did not exit within ${GRACE}s -- escalating to SIGKILL (this is a FAIL)"
  kill -KILL "$WRITER" 2>/dev/null
  KILLED=yes
fi
wait "$WRITER" 2>/dev/null
RC=$?
END=$(date +%s)
ELAPSED=$((END - START))

echo "exit_code=$RC elapsed=${ELAPSED}s sigkill_required=$KILLED"
printf '%s\n' "$ELAPSED" > "$OUT/shutdown-seconds.txt"
printf '%s\n' "$KILLED" > "$OUT/sigkill-required.txt"
printf '%s\n' "$RC" > "$OUT/writer-exit-code.txt"

echo "=== Stage 2.75: reconciling client-acknowledged vs database ==="
ACK_LOG="$ACK" \
SHUTDOWN_SECONDS="$ELAPSED" \
SIGKILL_REQUIRED="$KILLED" \
WRITER_EXIT_CODE="$RC" \
GRACE_PERIOD="$GRACE" \
node tools/cp8/cp9-stage275-verify.mjs | tee "$OUT/result.txt"
exit "${PIPESTATUS[0]}"
