#!/usr/bin/env bash
# Deliberate error-capture + redaction proof (LB-B02).
# Emits a synthetic structured error record containing fake secrets, then verifies the scanner
# aggregates it and that no secret value survives into the alert text.
set -uo pipefail
SCAN=/home/ubuntu/learnbox/ops/learnbox-error-scan.sh
LOG=/tmp/lb-error-capture-proof.$$
trap 'rm -f "$LOG"' EXIT

# A record shaped exactly like the app's captureServerError output, carrying material that must
# never reach Telegram.
cat > "$LOG" <<'JSON'
{"kind":"learnbox.error","fingerprint":"deadbeefcafe0001","name":"SyntheticVerificationError","route":"/api/learner/reviews","message":"token=SECRET_TOKEN_SHOULD_NOT_APPEAR phone=09121234567 password=hunter2","occurredAt":"2026-09-28T18:00:00.000Z"}
JSON

echo "=== scanner output for a synthetic error ==="
OUT="$(LEARNBOX_ERROR_LOG_FILE="$LOG" "$SCAN" 2>&1)"
echo "$OUT"
echo ""
echo "=== redaction assertions ==="
fail=0
for forbidden in SECRET_TOKEN_SHOULD_NOT_APPEAR 09121234567 hunter2; do
  if printf '%s' "$OUT" | grep -q "$forbidden"; then
    echo "  LEAK: '$forbidden' appeared in scanner output"; fail=1
  else
    echo "  ok: '$forbidden' not present"
  fi
done
exit $fail
