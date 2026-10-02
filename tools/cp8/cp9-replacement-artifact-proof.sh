#!/usr/bin/env bash
# LB-B35 CP9 Stage-2 replacement artifact verification.
#
# The first candidate passed a 4-check suite and was still unfit for Production: it was arm64 and
# baked APP_SOURCE_SHA=unknown. A matching digest proves integrity, NOT runnability or provenance.
# This suite therefore verifies architecture, provenance, the full flag matrix, parity with the live
# Production bundle, and an actual amd64 process start.
#
# Usage: cp9-replacement-artifact-proof.sh <candidate-image> <expected-sha> [prod-bundle-facts-file]
set -uo pipefail

CAND="${1:-learnbox-app:cp9-candidate-amd64}"
EXPECT_SHA="${2:?expected full source sha required}"
OUT="${3:-${TMPDIR:-/tmp}/cp9-replacement}"
mkdir -p "$OUT"

pass=0; fail=0
check() { if [ "$2" = "yes" ]; then echo "PASS $1 ${3:+:: $3}"; pass=$((pass+1)); else echo "FAIL $1 ${3:+:: $3}"; fail=$((fail+1)); fi; }

echo "=== artifact identity ==="
ARCH=$(docker image inspect "$CAND" --format '{{.Os}}/{{.Architecture}}')
DIGEST=$(docker image inspect "$CAND" --format '{{.Id}}')
LABEL=$(docker image inspect "$CAND" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
echo "arch=$ARCH"; echo "digest=$DIGEST"; echo "oci_revision=$LABEL"

# 1. Architecture must be linux/amd64 (the Production host is x86_64).
[ "$ARCH" = "linux/amd64" ] && A=yes || A=no
check "image architecture is linux/amd64 (matches Production host)" "$A" "$ARCH"

# 2. Provenance: the OCI revision label must carry the exact expected source SHA.
[ "$LABEL" = "$EXPECT_SHA" ] && B=yes || B=no
check "OCI revision label is the exact approved source SHA" "$B" "$LABEL"

# 3. Provenance: the runtime ENV must agree, and must not be the 'unknown' default.
ENV_SHA=$(docker image inspect "$CAND" --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^APP_SOURCE_SHA=//p')
{ [ "$ENV_SHA" = "$EXPECT_SHA" ] && [ "$ENV_SHA" != "unknown" ]; } && C=yes || C=no
check "runtime APP_SOURCE_SHA env is the approved SHA (not 'unknown')" "$C" "$ENV_SHA"

# --- bundle reads. amd64 on an arm64 host needs emulation; --platform makes it explicit. ---
inbundle() { docker run --rm --platform linux/amd64 --entrypoint sh "$CAND" -c "$1" 2>/dev/null; }

echo "=== build-time flag matrix (read from the artifact) ==="
# 4. D-2: binary review UI must be inlined FALSE at the gate site.
GATE=$(inbundle 'grep -rhoE "binaryWire:[^,}]{1,6}" /app/apps/website/.next/static/chunks | sort -u | head -1')
[ "$GATE" = "binaryWire:!1" ] && D=yes || D=no
check "binary review UI gate inlined as FALSE (D-2 deferral honoured)" "$D" "${GATE:-<not found>}"

# 5. Profile Identity must be inlined "true" — the flag the rejected build would have regressed.
PROF=$(inbundle 'grep -rhoE "profileIdentityFlag:[^=]{1,12}=\"(true|false)\"" /app/apps/website/.next/static/chunks | sort -u | head -1')
case "$PROF" in *'="true"') E=yes;; *) E=no;; esac
check "Profile Identity inlined TRUE (parity with live Production)" "$E" "${PROF:-<not found>}"

# 6. The three non-ARG flags must remain NON-inlined (names still present), exactly as in Production.
NONINLINED=$(inbundle 'grep -rhoE "NEXT_PUBLIC_LEARNBOX_(OTP_UI_ENABLED|ALPHA_INVITE_UI_ENABLED|PRIVATE_MEDIA_ENABLED)" /app/apps/website/.next/static/chunks | sort -u | wc -l | tr -d " "')
[ "$NONINLINED" = "3" ] && F=yes || F=no
check "the 3 non-ARG flags remain runtime lookups (structural parity with Production)" "$F" "count=$NONINLINED/3"

# 7. No NEXT_PUBLIC_LEARNBOX env in the runner stage: inlined values are not runtime-flippable.
RT=$(inbundle 'env | grep -c NEXT_PUBLIC_LEARNBOX || true')
[ "${RT:-x}" = "0" ] && G=yes || G=no
check "runner stage carries no NEXT_PUBLIC_LEARNBOX env (not runtime-flippable)" "$G" "count=${RT:-?}"

echo "=== CP9 payload present (N1 preflight) ==="
# 8. The N1 preflight must actually be in the image - this is the whole point of the candidate.
N1=$(inbundle 'test -f /app/apps/api/dist/reviews/binary-review-preflight.js && echo present || echo absent')
[ "$N1" = "present" ] && H=yes || H=no
check "N1 binary-review preflight compiled into the artifact" "$H" "$N1"

# 9. And it must be wired into the store (the gap that makes it load-bearing).
WIRED=$(inbundle 'grep -c verifyBinaryReviewSchema /app/apps/api/dist/reviews/postgres-review-event.store.js || true')
[ "${WIRED:-0}" -gt 0 ] && I=yes || I=no
check "preflight wired into PostgresReviewEventStore" "$I" "refs=${WIRED:-0}"

echo "=== runtime smoke start (proves RUNNABLE for the Production arch, not merely transferable) ==="
# 10. Start the real server process under amd64 and require a listening HTTP port.
docker rm -f cp9-smoke >/dev/null 2>&1 || true
docker run -d --name cp9-smoke --platform linux/amd64 \
  -e NODE_ENV=production -e PORT=3000 \
  -e DATABASE_URL="postgres://smoke:smoke@127.0.0.1:1/smoke" \
  -p 39311:3000 "$CAND" >/dev/null 2>&1
CODE=""
for i in $(seq 1 45); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:39311/ 2>/dev/null || true)
  [ -n "$CODE" ] && [ "$CODE" != "000" ] && break
  sleep 2
done
RUNNING=$(docker inspect cp9-smoke --format '{{.State.Running}}' 2>/dev/null || echo false)
SMOKE_SHA=$(docker exec cp9-smoke printenv APP_SOURCE_SHA 2>/dev/null || echo "")
echo "http_code=$CODE running=$RUNNING exec_sha=$SMOKE_SHA"
docker logs cp9-smoke 2>&1 | tail -12 > "$OUT/smoke-logs.txt"; sed 's/^/  log| /' "$OUT/smoke-logs.txt"

{ [ -n "$CODE" ] && [ "$CODE" != "000" ]; } && J=yes || J=no
check "amd64 Node binary starts and Next binds port (DB connectivity NOT proven here)" "$J" "http=$CODE"

[ "$SMOKE_SHA" = "$EXPECT_SHA" ] && K=yes || K=no
check "running container reports the approved APP_SOURCE_SHA" "$K" "$SMOKE_SHA"

# 12. The API layer must be REACHABLE and fail gracefully, not crash: with an unreachable DB,
#     /api/health must answer 503 rather than hang or kill the process. Check 10 alone cannot
#     distinguish "app works" from "static shell served while every API route is dead".
HEALTH=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:39311/api/health 2>/dev/null || true)
[ "$HEALTH" = "503" ] && L=yes || L=no
check "API layer reachable and fails gracefully on unreachable DB (503, no crash)" "$L" "health=$HEALTH"

# 13. SECURITY INVARIANT: anonymous protected media must never return 200 from this artifact.
#     Server-side auth must hold regardless of build flags or hostname.
MEDIA=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:39311/api/content-media/abc/image 2>/dev/null || true)
[ "$MEDIA" = "401" ] && M=yes || M=no
check "anonymous protected media returns 401 (never 200) from the artifact" "$M" "media=$MEDIA"

# 14. Kernel arch as reported by the running container itself.
UNAME=$(docker exec cp9-smoke uname -m 2>/dev/null || true)
[ "$UNAME" = "x86_64" ] && N=yes || N=no
check "running container reports x86_64" "$N" "$UNAME"

docker rm -f cp9-smoke >/dev/null 2>&1 || true

printf 'arch=%s\ndigest=%s\noci_revision=%s\nenv_sha=%s\ngate=%s\nprofile=%s\nnoninlined=%s\nsmoke_http=%s\n' \
  "$ARCH" "$DIGEST" "$LABEL" "$ENV_SHA" "$GATE" "$PROF" "$NONINLINED" "$CODE" > "$OUT/artifact-facts.txt"

echo
echo "CP9-REPLACEMENT-ARTIFACT: $pass passed, $fail failed"
exit $((fail == 0 ? 0 : 1))
