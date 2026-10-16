#!/usr/bin/env bash
# LearnBox Iran monitor — runs ON the Iran host every 5 min, independent of Germany.
# Telegram/SMTP are blocked from Iran, so alerts go through Healthchecks.io (reachable from Iran):
#   learnbox-iran-uptime  : 3 public domains (via the Arvan CDN), Learner /api/health (DB), Admin,
#                           Enamad file, container health. /fail on problem; silence = host/network down.
#   learnbox-iran-backups : local backup <=26h, Dropbox offsite <=27h, restore drill <=8d.
#   learnbox-iran-disk-warning / -critical : / >=75% or <15 GiB free / >=85% or <8 GiB free.
# Healthchecks alerts the owner (Telegram/email) once on down and once on recovery.
# Ping URLs live only in $CONF (0600, created by learnbox-iran-monitor-enroll.sh); never in Git.
# Test knobs: LEARNBOX_MONITOR_FORCE_FAIL=1 (controlled alert), LEARNBOX_MONITOR_DRY=1 (no pings),
#   LEARNBOX_MONITOR_DISK_TEST='<used%> <avail-bytes>' + LEARNBOX_DISK_STATE=<tmp file> (fake disk).
set -uo pipefail
CONF="${LEARNBOX_HC_CONF:-/home/ubuntu/learnbox/secrets/healthchecks.env}"
L=/home/ubuntu/learnbox
read_key() { grep -m1 "^$1=" "$CONF" 2>/dev/null | cut -d= -f2-; }
UPTIME_URL=$(read_key HC_UPTIME_URL); BACKUPS_URL=$(read_key HC_BACKUPS_URL)
if [ -z "${LEARNBOX_MONITOR_DRY:-}" ] && { [ -z "$UPTIME_URL" ] || [ -z "$BACKUPS_URL" ]; }; then
  echo "monitor: ping URLs missing in $CONF" >&2; exit 2
fi
now=$(date -u +%s)
up=""; bk=""

probe() {  # label url [required-substring]; one retry so a single blip does not page
  local out code
  for _ in 1 2; do
    out=$(curl -s -m 15 -w '\n%{http_code}' "$2"); code=${out##*$'\n'}
    if [ "$code" = 200 ] && { [ -z "${3:-}" ] || grep -qF "$3" <<<"$out"; }; then return 0; fi
    sleep 10
  done
  up+="$1 HTTP $code; "
}
probe landing https://learnboxapp.com/
probe learner https://app.learnboxapp.com/api/health '"status":"ok"'
probe admin https://admin.learnboxapp.com/api/auth/login/options
probe enamad https://learnboxapp.com/41346530.txt
for c in learnbox-app-production-app-1 learnbox-admin-production-admin-1 learnbox-production-landing-1 learnbox-db-postgres-1; do
  [ "$(docker inspect -f '{{.State.Health.Status}}' "$c" 2>/dev/null)" = healthy ] || up+="$c not healthy; "
done
[ -n "${LEARNBOX_MONITOR_FORCE_FAIL:-}" ] && up+="CONTROLLED TEST ALERT (not a real outage); "

fresh() {  # label status-file max-hours
  local st at age
  st=$(sed -n 's/^status=//p' "$2" 2>/dev/null | head -1); at=$(sed -n 's/^at=//p' "$2" 2>/dev/null | head -1)
  age=$(( (now - $(date -u -d "${at:-1970-01-01T00:00:00Z}" +%s 2>/dev/null || echo 0)) / 3600 ))
  [ "$st" = ok ] && [ "$age" -le "$3" ] || bk+="$1 status=${st:-missing} age=${age}h; "
}
fresh backup "$L/ops/state/backup.status" 26
fresh offsite "$L/offsite/state/offsite.status" 27
fresh restore-drill "$L/ops/state/restore-drill.status" 192

# Disk: own checks (warning / critical) so a lingering low-disk alert never masks an outage alert.
# Hysteresis: once raised, a level clears only 3 points / 2 GiB below its threshold (no flapping).
read -r used avail <<<"$(df -B1 --output=pcent,avail / | tail -1 | tr -d %)"
[ -n "${LEARNBOX_MONITOR_DISK_TEST:-}" ] && read -r used avail <<<"$LEARNBOX_MONITOR_DISK_TEST"
gib=$(( avail / 1073741824 ))
DST="${LEARNBOX_DISK_STATE:-$L/ops/state/disk.state}"
{ read -r pw pc < "$DST"; } 2>/dev/null || { pw=0; pc=0; }
w=$(( used >= (pw ? 72 : 75) || gib < (pw ? 17 : 15) ))
c=$(( used >= (pc ? 82 : 85) || gib < (pc ? 10 : 8) ))
echo "$w $c" > "$DST"
dw=""; dc=""
[ "$w" = 1 ] && dw="DISK WARNING: ${used}% used, ${gib} GiB free (threshold 75% / 15 GiB); "
[ "$c" = 1 ] && dc="DISK CRITICAL: ${used}% used, ${gib} GiB free (threshold 85% / 8 GiB); "
echo "monitor: uptime=${up:-ok} backups=${bk:-ok} disk=${used}%/${gib}GiB warn=$w crit=$c"
[ -n "${LEARNBOX_MONITOR_DRY:-}" ] && exit 0
ping_hc() {  # url problems
  if [ -z "$2" ]; then curl -fsS -m 15 --retry 3 -o /dev/null "$1"
  else curl -fsS -m 15 --retry 3 -o /dev/null --data-raw "$2" "$1/fail"; fi
}
rc=0
ping_hc "$UPTIME_URL" "$up" || { echo "monitor: uptime ping failed" >&2; rc=1; }
ping_hc "$BACKUPS_URL" "$bk" || { echo "monitor: backups ping failed" >&2; rc=1; }
DW_URL=$(read_key HC_DISK_WARN_URL); DC_URL=$(read_key HC_DISK_CRIT_URL)
if [ -n "$DW_URL" ] && [ -n "$DC_URL" ]; then
  ping_hc "$DW_URL" "$dw" || { echo "monitor: disk-warning ping failed" >&2; rc=1; }
  ping_hc "$DC_URL" "$dc" || { echo "monitor: disk-critical ping failed" >&2; rc=1; }
else echo "monitor: disk checks not enrolled yet (run learnbox-iran-monitor-enroll.sh)" >&2; fi
exit $rc
