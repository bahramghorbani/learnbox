#!/usr/bin/env bash
# Runs on the GERMANY host (it can reach Telegram; Iran cannot). Pulls the Iran backup / offsite /
# restore-drill status files over a forced-command SSH key and alerts once per state change.
# Iran ~ubuntu/.ssh/authorized_keys entry for this key (read-only, nothing else allowed):
#   from="185.204.168.178",restrict,command="grep -H . /home/ubuntu/learnbox/ops/state/backup.status /home/ubuntu/learnbox/offsite/state/offsite.status /home/ubuntu/learnbox/ops/state/restore-drill.status" ssh-ed25519 ...
set -uo pipefail
KEY="${LEARNBOX_IRAN_STATUS_KEY:-/home/ubuntu/.ssh/learnbox-iran-status_ed25519}"
ALERT_BIN="${LEARNBOX_ALERT_BIN:-/home/ubuntu/learnbox/ops/learnbox-alert.sh}"
STATE="${LEARNBOX_MONITOR_STATE_DIR:-/home/ubuntu/learnbox/ops/state}/iran-backup-watch.state"
now=$(date -u +%s)

out=$(ssh -i "$KEY" -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=20 \
  ubuntu@185.226.118.146 2>/dev/null) || out=""

problems=""
check() {  # $1 label, $2 status-file basename, $3 max age in hours
  local st at age
  st=$(grep -m1 "/$2:status=" <<<"$out" | cut -d= -f2-)
  at=$(grep -m1 "/$2:at=" <<<"$out" | cut -d= -f2-)
  age=$(( (now - $(date -u -d "${at:-1970-01-01T00:00:00Z}" +%s 2>/dev/null || echo 0)) / 3600 ))
  [ "$st" = ok ] && [ "$age" -le "$3" ] || problems+="$1 status=${st:-missing} age=${age}h; "
}
if [ -z "$out" ]; then
  problems="Iran status unreachable over SSH; "
else
  check backup backup.status 26          # daily 02:30 UTC
  check offsite offsite.status 27        # daily 04:10 UTC (+15 min jitter)
  check restore-drill restore-drill.status 192  # weekly
fi

prev=$(cat "$STATE" 2>/dev/null || echo ok)
cur=${problems:-ok}
if [ "$cur" != "$prev" ]; then
  if [ "$cur" = ok ]; then "$ALERT_BIN" info "Iran backups recovered" "backup, offsite and restore drill ok"
  else "$ALERT_BIN" critical "Iran backup problem" "$cur"; fi && printf '%s' "$cur" > "$STATE"
fi
echo "iran-backup-watch: $cur"
[ "$cur" = ok ]
