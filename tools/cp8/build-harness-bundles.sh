#!/usr/bin/env bash
# CP8 harness bundle build.
#
# The CP8 evidence harness exercises the REAL web review path (handler, runtime, sync, client) in
# process. To do that it imports compiled ESM from apps/website/dist-cp8/.
#
# That directory is a BUILD ARTIFACT and is deliberately NOT committed: committing machine-built
# bundles would put unreviewable generated code in the repository and make the evidence harder, not
# easier, to audit. This script regenerates it from committed TypeScript sources, so
# tools/cp8/run-authoritative.sh is reproducible from a clean checkout.
#
# Usage:  ./tools/cp8/build-harness-bundles.sh
set -uo pipefail

cd "$(dirname "$0")/../.."
REPO="$PWD"
OUT="apps/website/dist-cp8"

# apps/api/dist is a real dependency of these bundles (mobile-review-batch.request.js et al),
# and the learning engine must be built before the API can compile.
echo "== building workspace dependencies (learning-engine, api) =="
pnpm --filter @learnbox/learning-engine build || { echo "FATAL: learning-engine build failed" >&2; exit 1; }
pnpm --filter @learnbox/api build || { echo "FATAL: api build failed" >&2; exit 1; }

ESBUILD="$(ls -d "$REPO"/node_modules/.pnpm/esbuild@*/node_modules/esbuild/bin/esbuild 2>/dev/null | sort -V | tail -1)"
if [ -z "$ESBUILD" ]; then
  echo "FATAL: esbuild not found under node_modules/.pnpm. Run pnpm install first." >&2
  exit 1
fi
echo "== esbuild: $ESBUILD =="

# CRITICAL: transpile PER FILE, never --bundle.
#
# Bundling inlines shared modules into each entry point, which DUPLICATES the error classes
# (SchedulerV2PreflightError, SchedulerInvariantError). The HTTP handler classifies failures with
# `instanceof`, so against a duplicated class the check silently fails and a deterministic 422
# schedulerRejected degrades into a retryable 503 serverUnavailable — which would quietly destroy
# the fail-closed evidence this harness exists to produce. Verified: bundling turns 24/24 into
# 20/24 with exactly those four 422 assertions failing.
#
# A per-file transpile preserves the module graph and therefore class identity.
mkdir -p "$OUT"
rm -f "$OUT"/*.js
"$ESBUILD" apps/website/lib/*.ts \
  --outdir="$OUT" \
  --platform=node \
  --format=esm \
  --target=node22 \
  --log-level=warning || { echo "BUILD_STATUS=FAILED" >&2; exit 1; }

count=$(ls -1 "$OUT"/*.js 2>/dev/null | wc -l | tr -d ' ')
echo "transpiled_modules=$count"

# esbuild leaves relative import specifiers extensionless ("./mutation-guard"), but Node's ESM
# resolver requires an explicit extension, so the modules would fail with ERR_MODULE_NOT_FOUND.
# Rewrite relative specifiers to add .js. Verified necessary: without this, importing
# learner-review-web-http.js throws ERR_MODULE_NOT_FOUND on ./mutation-guard.
python3 - "$OUT" <<'PYEOF'
import os, re, sys
out = sys.argv[1]
pat = re.compile(r'(\bfrom\s*|\bimport\s*\(?\s*)(["\'])(\.{1,2}/[^"\']*?)(["\'])')
def fix(m):
    pre, q1, spec, q2 = m.groups()
    if os.path.splitext(spec)[1]:
        return m.group(0)
    return f'{pre}{q1}{spec}.js{q2}'
changed = 0
for name in sorted(os.listdir(out)):
    if not name.endswith('.js'):
        continue
    p = os.path.join(out, name)
    src = open(p).read()
    new = pat.sub(fix, src)
    if new != src:
        open(p, 'w').write(new)
        changed += 1
print(f'extension_rewrites={changed}')
PYEOF

# A package.json marking these as ESM silences Node's reparse warning and makes the type explicit.
printf '{\n  "type": "module"\n}\n' > "$OUT/package.json"

# The harness imports these four directly; fail loudly if any is absent.
for name in learner-review-web-http learner-review-web-runtime learner-review-web-sync learner-review-web-client; do
  [ -f "$OUT/$name.js" ] || { echo "FATAL: expected $OUT/$name.js was not produced" >&2; exit 1; }
done

echo "BUILD_STATUS=OK"
echo "Now run: export STAGING_DATABASE_URL=... && ./tools/cp8/run-authoritative.sh"
