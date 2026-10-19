#!/usr/bin/env bash
# Durable pack-media runner. Source-only: installation and enablement require separate owner approval.
# The bearer token is read only inside the Admin container, never from a command line, URL, log or
# status file. One invocation asks the authenticated internal endpoint to claim at most one item.
set -uo pipefail
ADMIN="${LEARNBOX_PACK_MEDIA_ADMIN_CONTAINER:-learnbox-admin-production-admin-1}"
STATE="${LEARNBOX_PACK_MEDIA_RUNNER_STATE:-/home/ubuntu/learnbox/ops/state/pack-media-runner.status}"

JS='const t = process.env.LEARNBOX_PACK_MEDIA_RUNNER_TOKEN || "";
fetch("http://127.0.0.1:3000/api/internal/content/media/runner", {
  method: "POST", headers: { authorization: "Bearer " + t }, signal: AbortSignal.timeout(300000),
}).then(async (r) => {
  let j = {}; try { j = JSON.parse(await r.text()); } catch {}
  if (r.status !== 200) { console.log("http=" + r.status + " error=" + (j.error || "unknown")); process.exit(1); }
  console.log("http=200 status=" + (j.status || "unknown"));
}).catch((e) => { console.log("request_failed=" + e.name); process.exit(1); });'

out=$(timeout 330 docker exec "$ADMIN" node -e "$JS" 2>/dev/null); rc=$?
detail=$(printf '%s\n' "$out" | tail -1)
[ -n "$detail" ] || detail="no_output rc=$rc"
status=ok; [ "$rc" = 0 ] || status=fail
mkdir -p "$(dirname "$STATE")"
tmp="$STATE.tmp.$$"
printf 'status=%s\nat=%s\ndetail=%s\n' "$status" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$detail" > "$tmp" && mv -f "$tmp" "$STATE"
echo "pack-media-runner: $status $detail"
[ "$status" = ok ]
