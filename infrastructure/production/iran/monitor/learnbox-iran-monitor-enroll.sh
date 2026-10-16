#!/usr/bin/env bash
# Owner runs this ON THE MAC after: (1) signing up at healthchecks.io, (2) adding the Telegram
# integration (Integrations -> Telegram), (3) creating a read-write API key (Settings -> API Access).
# It creates/reuses four checks (re-running is safe: existing checks are matched by name) attached to ALL integrations and stores ONLY their ping URLs on the
# Iran server (0600). The API key is read hidden, kept in memory, never written or put on argv.
set -euo pipefail
read -rsp "Healthchecks.io API key (read-write): " KEY; echo
[ -n "$KEY" ] || { echo "empty key"; exit 1; }
mk() {  # name timeout-s grace-s desc -> ping_url
  curl -fsS -m 30 -H @<(printf 'X-Api-Key: %s\n' "$KEY") -H 'Content-Type: application/json' \
    -d "{\"name\":\"$1\",\"timeout\":$2,\"grace\":$3,\"desc\":\"$4\",\"tags\":\"learnbox iran\",\"channels\":\"*\",\"unique\":[\"name\"]}" \
    https://healthchecks.io/api/v3/checks/ | python3 -c 'import json,sys; print(json.load(sys.stdin)["ping_url"])'
}
U=$(mk learnbox-iran-uptime 300 600 "LearnBox Iran: domains, Learner/Admin health, containers. Silent = server or network down.")
B=$(mk learnbox-iran-backups 3600 3600 "LearnBox Iran: local backup, Dropbox offsite, restore drill freshness.")
DW=$(mk learnbox-iran-disk-warning 86400 3600 "LearnBox Iran: root disk >=75% used or <15 GiB free.")
DC=$(mk learnbox-iran-disk-critical 86400 3600 "LearnBox Iran: root disk >=85% used or <8 GiB free. Act now.")
unset KEY
printf 'HC_UPTIME_URL=%s\nHC_BACKUPS_URL=%s\nHC_DISK_WARN_URL=%s\nHC_DISK_CRIT_URL=%s\n' "$U" "$B" "$DW" "$DC" | ssh -o BatchMode=yes learnbox-iran-cdn \
  'umask 077; f=/home/ubuntu/learnbox/secrets/healthchecks.env; cat > $f.new && chmod 600 $f.new && mv $f.new $f && sudo systemctl enable --now learnbox-iran-monitor.timer >/dev/null 2>&1 && echo stored'
echo "HEALTHCHECKS_ENROLL_OK"
