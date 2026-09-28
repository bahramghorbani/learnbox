#!/usr/bin/env bash
# LearnBox uptime + readiness monitor (LB-B02).
#
# Polls the public learner app from outside the container and alerts the owner when it becomes
# unhealthy, then alerts again on recovery. State is kept in a small file so a sustained outage
# produces one alert rather than one per run.
#
# Checks:
#   1. the public app root responds 200 (edge + TLS + Caddy + container all working)
#   2. /api/health reports a usable status (the process can actually reach its database)
#
# This script performs NO mutation and touches no learner data.
set -euo pipefail

APP_ORIGIN="${LEARNBOX_MONITOR_ORIGIN:-https://app.learnboxapp.com}"
STATE_DIR="${LEARNBOX_MONITOR_STATE_DIR:-/home/ubuntu/learnbox/ops/state}"
ALERT_BIN="${LEARNBOX_ALERT_BIN:-/home/ubuntu/learnbox/ops/learnbox-alert.sh}"
FAILURES_BEFORE_ALERT="${LEARNBOX_MONITOR_FAILURES_BEFORE_ALERT:-2}"
# Health path may be set empty to check availability only. This matters during a deploy window in
# which the running build predates /api/health: a missing endpoint is not an outage.
HEALTH_PATH="${LEARNBOX_MONITOR_HEALTH_PATH-/api/health}"

mkdir -p "$STATE_DIR"
STATE_FILE="$STATE_DIR/uptime.state"
FAIL_FILE="$STATE_DIR/uptime.failures"

previous="ok"
[ -r "$STATE_FILE" ] && previous="$(cat "$STATE_FILE" 2>/dev/null || echo ok)"
failures=0
[ -r "$FAIL_FILE" ] && failures="$(cat "$FAIL_FILE" 2>/dev/null || echo 0)"

problem=""

root_code="$(curl -sS -o /dev/null -w '%{http_code}' -m 15 "$APP_ORIGIN/" 2>/dev/null || echo 000)"
if [ "$root_code" != "200" ]; then
  problem="Learner app root returned HTTP ${root_code}"
fi

if [ -z "$problem" ] && [ -n "$HEALTH_PATH" ]; then
  health_body="$(curl -sS -m 15 "$APP_ORIGIN$HEALTH_PATH" 2>/dev/null || echo '')"
  health_code="$(curl -sS -o /dev/null -w '%{http_code}' -m 15 "$APP_ORIGIN$HEALTH_PATH" 2>/dev/null || echo 000)"
  case "$health_code" in
    200) ;;
    503) problem="Health endpoint reports a dependency down" ;;
    *) problem="Health endpoint returned HTTP ${health_code}" ;;
  esac
  case "$health_body" in
    *'"status":"degraded"'*)
      [ -z "$problem" ] && problem="Health endpoint reports degraded dependencies"
      ;;
  esac
fi

if [ -n "$problem" ]; then
  failures=$((failures + 1))
  echo "$failures" > "$FAIL_FILE"
  # Alert once, when the failure streak first crosses the threshold.
  if [ "$failures" -ge "$FAILURES_BEFORE_ALERT" ] && [ "$previous" != "down" ]; then
    echo "down" > "$STATE_FILE"
    [ -x "$ALERT_BIN" ] && "$ALERT_BIN" critical "Learner app unhealthy" "$problem
origin: $APP_ORIGIN" || true
  fi
  echo "monitor: PROBLEM ($failures/$FAILURES_BEFORE_ALERT) $problem"
  exit 1
fi

echo 0 > "$FAIL_FILE"
if [ "$previous" = "down" ]; then
  echo "ok" > "$STATE_FILE"
  [ -x "$ALERT_BIN" ] && "$ALERT_BIN" info "Learner app recovered" "origin: $APP_ORIGIN" || true
fi
echo "ok" > "$STATE_FILE"
echo "monitor: ok"
