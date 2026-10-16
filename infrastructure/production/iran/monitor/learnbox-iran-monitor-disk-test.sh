#!/usr/bin/env bash
# Disk-alert self-check (no pings, fake disk values, temp state). Run on the Iran host:
#   bash learnbox-iran-monitor-disk-test.sh /home/ubuntu/learnbox/ops/learnbox-iran-monitor.sh
set -u; M=${1:?monitor script}; S=$(mktemp); fail=0
step() { # used% free-GiB expected-"warn crit"
  local out; out=$(LEARNBOX_MONITOR_DRY=1 LEARNBOX_DISK_STATE=$S LEARNBOX_MONITOR_DISK_TEST="$1 $(( $2 * 1073741824 ))" bash "$M" 2>/dev/null | grep -o 'warn=[01] crit=[01]')
  [ "$out" = "$3" ] && echo "PASS $1% ${2}GiB -> $out" || { echo "FAIL $1% ${2}GiB -> $out (want $3)"; fail=1; }
}
step 10 60 "warn=0 crit=0"; step 74 16 "warn=0 crit=0"; step 75 16 "warn=1 crit=0"
step 50 14 "warn=1 crit=0"; step 73 16 "warn=1 crit=0"   # hysteresis: stays raised
step 71 18 "warn=0 crit=0"; step 85 20 "warn=1 crit=1"; step 60 7 "warn=1 crit=1"
step 83 11 "warn=1 crit=1"; step 81 11 "warn=1 crit=0"; step 10 60 "warn=0 crit=0"
rm -f "$S"; exit $fail
