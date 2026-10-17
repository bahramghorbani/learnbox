#!/usr/bin/env bash
# LearnBox commerce reconciliation trigger. NOT INSTALLED: installing it is part of the separately
# authorized payment activation (docs/operations/IRAN_PRODUCTION_RUNBOOK.md, "Commerce reconciliation").
#
# Runs ON the Iran host from learnbox-commerce-reconcile.timer every 10 min. It asks the learner app to
# re-check unsettled Zarinpal attempts and to execute queued Admin re-check requests
# (POST /api/internal/commerce/reconcile, commerce contract §4 and §10.1). The provider call stays in the
# app's payment service; this script never talks to Zarinpal and never touches the database.
#
# Machine authentication: the bearer token is LEARNBOX_COMMERCE_RECONCILE_TOKEN in the app container's own
# environment (app/.env). The request is made inside the container to 127.0.0.1:3000, so the token is never
# on a command line, in a URL, in Caddy logs or in this script's output. Output is counts only.
#
# Status file, same format as backup.status, read by the existing monitor (one `fresh` line, see runbook):
#   status=ok|fail   at=<UTC ISO>   detail=<http code and counts, no secret>
set -uo pipefail
APP="${LEARNBOX_RECONCILE_APP_CONTAINER:-learnbox-app-production-app-1}"
STATE="${LEARNBOX_RECONCILE_STATE:-/home/ubuntu/learnbox/ops/state/commerce-reconcile.status}"

# Plain JavaScript executed by the app image's own Node; reads the token from the container env.
JS='const t = process.env.LEARNBOX_COMMERCE_RECONCILE_TOKEN || "";
fetch("http://127.0.0.1:3000/api/internal/commerce/reconcile", {
  method: "POST", headers: { authorization: "Bearer " + t }, signal: AbortSignal.timeout(240000),
}).then(async (r) => {
  let j = {}; try { j = JSON.parse(await r.text()); } catch {}
  if (r.status !== 200) { console.log("http=" + r.status + " error=" + (j.error || "unknown")); process.exit(1); }
  console.log("http=200 checked=" + j.checked + " verified=" + j.verified);
}).catch((e) => { console.log("request_failed=" + e.name); process.exit(1); });'

out=$(timeout 300 docker exec "$APP" node -e "$JS" 2>/dev/null); rc=$?
detail=$(printf '%s\n' "$out" | tail -1)
[ -n "$detail" ] || detail="no_output rc=$rc"
status=ok; [ "$rc" = 0 ] || status=fail
mkdir -p "$(dirname "$STATE")"
tmp="$STATE.tmp.$$"
printf 'status=%s\nat=%s\ndetail=%s\n' "$status" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$detail" > "$tmp" && mv -f "$tmp" "$STATE"
echo "commerce-reconcile: $status $detail"
[ "$status" = ok ]
