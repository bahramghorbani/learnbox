#!/usr/bin/env bash
# LB-B35 CP9: prove from the BUILT ARTIFACT (not from config) that the CP9-excluded compile-time UI
# flags are disabled in the candidate image.
#
# Why a differential: Next.js inlines `process.env.NEXT_PUBLIC_X === 'true'` to a literal, so the flag
# NAME disappears from the bundle and the component's label strings remain present as dead code in
# BOTH builds. Searching for strings therefore proves nothing. What does prove it:
#   (a) the candidate bundle is byte-different from an otherwise identical flag-ON control build, and
#   (b) the specific client chunk that carries the gate differs, and
#   (c) the candidate image's baked ENV records false.
set -uo pipefail

CAND="${1:-learnbox-app:cp9-candidate}"
CTRL="${2:-learnbox-app:cp9-control-uion}"
OUT="${3:-${TMPDIR:-/tmp}/cp9-artifact}"
mkdir -p "$OUT"

fingerprint() { # image -> sorted "sha256  path" of every client chunk
  docker run --rm --entrypoint sh "$1" -c \
    'find /app/apps/website/.next/static -type f -name "*.js" -exec sha256sum {} + | sort -k2' \
    > "$2"
}

echo "=== fingerprinting candidate and control client bundles ==="
fingerprint "$CAND" "$OUT/candidate.sha"
fingerprint "$CTRL" "$OUT/control.sha"

CAND_N=$(wc -l < "$OUT/candidate.sha" | tr -d ' ')
CTRL_N=$(wc -l < "$OUT/control.sha" | tr -d ' ')
DIFF_N=$(diff "$OUT/candidate.sha" "$OUT/control.sha" | grep -c '^[<>]' || true)

echo "candidate_chunks=$CAND_N control_chunks=$CTRL_N differing_lines=$DIFF_N"

pass=0; fail=0
check() { if [ "$2" = "yes" ]; then echo "PASS $1 ${3:+:: $3}"; pass=$((pass+1)); else echo "FAIL $1 ${3:+:: $3}"; fail=$((fail+1)); fi; }

# (a) the two builds must differ: if they were identical the build arg would be inert.
[ "$DIFF_N" -gt 0 ] && A=yes || A=no
check "flag-OFF bundle differs from flag-ON control (build arg is genuinely wired)" "$A" "$DIFF_N differing chunk lines"

# (b) The decisive check: read the INLINED LITERAL out of the shipped client chunk. Next replaces
# `process.env.NEXT_PUBLIC_LEARNBOX_BINARY_REVIEW_UI === 'true'` with a constant, which the minifier
# emits as `!1` (false) or `!0` (true) at the `binaryWire:` call site. This is read from the artifact.
gate() { docker run --rm --entrypoint sh "$1" -c \
  'grep -rhoE "binaryWire:[^,}]{1,6}" /app/apps/website/.next/static/chunks/app/page-*.js 2>/dev/null | sort -u | head -1'; }

CAND_GATE=$(gate "$CAND"); CTRL_GATE=$(gate "$CTRL")
echo "--- inlined gate literal ---"; echo "candidate: $CAND_GATE"; echo "control:   $CTRL_GATE"
printf 'candidate=%s\ncontrol=%s\n' "$CAND_GATE" "$CTRL_GATE" > "$OUT/inlined-gate.txt"

[ "$CAND_GATE" = "binaryWire:!1" ] && C=yes || C=no
check "candidate bundle inlines binary review UI gate as FALSE (!1)" "$C" "$CAND_GATE"

[ "$CTRL_GATE" = "binaryWire:!0" ] && B=yes || B=no
check "control bundle inlines it as TRUE (!0), so the differential is valid" "$B" "$CTRL_GATE"

# (c) The runner stage must carry NO NEXT_PUBLIC_* env at all: that is what makes these flags
# un-flippable at runtime. A runtime env var cannot change an already-inlined literal.
RUNTIME_N=$(docker run --rm --entrypoint sh "$CAND" -c 'env | grep -c NEXT_PUBLIC_LEARNBOX || true')
[ "$RUNTIME_N" = "0" ] && D=yes || D=no
check "runner image carries no NEXT_PUBLIC_LEARNBOX env (not runtime-flippable)" "$D" "count=$RUNTIME_N"

echo
echo "CP9-ARTIFACT: $pass passed, $fail failed"
exit $((fail == 0 ? 0 : 1))
