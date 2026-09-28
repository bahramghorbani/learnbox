#!/usr/bin/env bash
# LearnBox operational alert sender (LB-B02).
#
# Sends a short operational message to the owner's Telegram alert route.
#
# Secrets: the bot token and chat id are read from an operator-owned env file that is NEVER in Git
# (default /home/ubuntu/learnbox/ops/alerting.env, mode 0600). This script must not echo the token,
# and no caller may pass it as an argument, because process arguments are world-readable in /proc.
#
# Usage: learnbox-alert.sh <severity> <title> [detail]
#   severity: info | warn | critical
set -euo pipefail

ALERT_ENV="${LEARNBOX_ALERT_ENV:-/home/ubuntu/learnbox/ops/alerting.env}"

severity="${1:-info}"
title="${2:-}"
detail="${3:-}"

if [ -z "$title" ]; then
  echo "usage: $(basename "$0") <info|warn|critical> <title> [detail]" >&2
  exit 2
fi

if [ ! -r "$ALERT_ENV" ]; then
  echo "alert: no alert configuration at $ALERT_ENV; nothing sent" >&2
  exit 3
fi

# shellcheck disable=SC1090
set +u
. "$ALERT_ENV"
set -u

: "${LEARNBOX_ALERT_TELEGRAM_BOT_TOKEN:=}"
: "${LEARNBOX_ALERT_TELEGRAM_CHAT_ID:=}"

if [ -z "$LEARNBOX_ALERT_TELEGRAM_BOT_TOKEN" ] || [ -z "$LEARNBOX_ALERT_TELEGRAM_CHAT_ID" ]; then
  echo "alert: alert route not configured; nothing sent" >&2
  exit 3
fi

case "$severity" in
  critical) icon="🔴" ;;
  warn) icon="🟠" ;;
  *) icon="🔵" ;;
esac

host="$(hostname -s 2>/dev/null || echo unknown)"
stamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

text="${icon} LearnBox ${severity}
${title}"
if [ -n "$detail" ]; then
  text="${text}

${detail}"
fi
text="${text}

host: ${host}
time: ${stamp}"

# --data-urlencode keeps the token out of the URL and the message safe for any characters.
# Output is discarded except the status code so the token can never appear in logs.
status="$(
  curl -sS -o /dev/null -w '%{http_code}' -m 20 \
    -X POST "https://api.telegram.org/bot${LEARNBOX_ALERT_TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${LEARNBOX_ALERT_TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${text}" \
    --data-urlencode "disable_web_page_preview=true" 2>/dev/null || echo 000
)"

if [ "$status" = "200" ]; then
  echo "alert: delivered (${severity})"
  exit 0
fi

# Never print the response body: Telegram echoes the bot token in some error payloads.
echo "alert: delivery failed with HTTP ${status}" >&2
exit 1
