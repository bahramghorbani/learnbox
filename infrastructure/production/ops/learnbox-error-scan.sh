#!/usr/bin/env bash
# LearnBox error-capture scanner (LB-B02).
#
# Reads structured `learnbox.error` records that the app emits to container logs, aggregates them
# per fingerprint over the scan window, and alerts the owner when new faults appear. This is the
# lightweight alternative to a hosted observability platform: no agent in the container, no learner
# data leaving the host, no third-party processor to declare in the privacy notice.
#
# The scanner only READS docker logs. It never restarts, mutates or reconfigures anything.
set -euo pipefail

CONTAINER="${LEARNBOX_ERROR_CONTAINER:-learnbox-app-production-app-1}"
WINDOW="${LEARNBOX_ERROR_WINDOW:-15m}"
STATE_DIR="${LEARNBOX_MONITOR_STATE_DIR:-/home/ubuntu/learnbox/ops/state}"
ALERT_BIN="${LEARNBOX_ALERT_BIN:-/home/ubuntu/learnbox/ops/learnbox-alert.sh}"
THRESHOLD="${LEARNBOX_ERROR_ALERT_THRESHOLD:-1}"

mkdir -p "$STATE_DIR"
SEEN_FILE="$STATE_DIR/error-fingerprints.seen"
touch "$SEEN_FILE"

# Keep the seen-list bounded so it cannot grow without limit on a long-lived host.
if [ "$(wc -l < "$SEEN_FILE")" -gt 500 ]; then
  tail -n 200 "$SEEN_FILE" > "$SEEN_FILE.tmp" && mv "$SEEN_FILE.tmp" "$SEEN_FILE"
fi

logs="$(docker logs --since "$WINDOW" "$CONTAINER" 2>&1 || true)"

# Aggregate: fingerprint -> count, reading only well-formed learnbox.error records.
summary="$(printf '%s\n' "$logs" | grep -F '"kind":"learnbox.error"' 2>/dev/null | \
  sed -n 's/.*"fingerprint":"\([a-f0-9]*\)".*"name":"\([^"]*\)".*/\1 \2/p' | \
  sort | uniq -c | sort -rn || true)"

if [ -z "$summary" ]; then
  echo "error-scan: no captured errors in the last ${WINDOW}"
  exit 0
fi

new_report=""
total=0
while read -r count fingerprint name; do
  [ -z "${fingerprint:-}" ] && continue
  total=$((total + count))
  if ! grep -qx "$fingerprint" "$SEEN_FILE" 2>/dev/null; then
    echo "$fingerprint" >> "$SEEN_FILE"
    new_report="${new_report}
• ${name} ×${count} (id ${fingerprint})"
  fi
done <<EOF
$summary
EOF

if [ -n "$new_report" ] && [ "$total" -ge "$THRESHOLD" ]; then
  [ -x "$ALERT_BIN" ] && "$ALERT_BIN" warn "New server errors captured" "window: ${WINDOW}${new_report}" || true
  echo "error-scan: alerted on new fingerprints"
else
  echo "error-scan: ${total} captured error(s), no new fingerprints"
fi
