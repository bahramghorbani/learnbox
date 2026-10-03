#!/usr/bin/env bash
# CP16 mutation pass. Each mutant breaks ONE guarantee; the suite must FAIL.
# A surviving mutant means the guarantee is not actually tested.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

MOBILE=apps/mobile
EV=$MOBILE/lib/features/review/pending_review_event.dart
QU=$MOBILE/lib/features/review/review_queue.dart
BR=$MOBILE/lib/features/review/binary_response.dart
PROBE=scripts/cp16-mixed-client-compat-probe.mjs
# The mobile suite REGENERATES this committed fixture from live queue code, so a
# mutated run rewrites it with corrupt bytes and the mutation leaks into the tree
# as a tracked modification. It must be snapshot/restored like any mutated file
# even though no mutant edits it directly.
FIXTURE=$MOBILE/test/fixtures/cp16_downgrade_queue_states.json

killed=0
survived=0

# Files a mutant may edit directly (used for the applied-mutant check).
MUTATED_FILES=("$EV" "$QU" "$BR" "$PROBE")
# Every file a run can modify, including regenerated artifacts (snapshot/restore).
TOUCHED_FILES=("$EV" "$QU" "$BR" "$PROBE" "$FIXTURE")

# Snapshot by COPY, not `git checkout --`: some CP16 files are still untracked,
# and git checkout silently leaves an untracked file mutated. That exact flaw
# once left an inverted shadow-grade mapping behind in the working tree.
SNAP=$(mktemp -d)
for f in "${TOUCHED_FILES[@]}"; do
  mkdir -p "$SNAP/$(dirname "$f")"
  cp "$f" "$SNAP/$f"
done

restore() {
  for f in "${TOUCHED_FILES[@]}"; do
    cp "$SNAP/$f" "$f"
  done
}
verify_restored() {
  for f in "${TOUCHED_FILES[@]}"; do
    if ! cmp -s "$SNAP/$f" "$f"; then
      echo "FATAL: $f not restored"
      return 1
    fi
  done
}
trap 'restore; rm -rf "$SNAP"' EXIT

# run_mutant <name> <scope: mobile|probe> <test-path-or-empty>
run_mutant() {
  local name="$1" scope="$2" target="${3:-}"
  local out rc

  # An unapplied mutant is a HARNESS bug, not a passing guarantee. Without this
  # check a typo'd pattern reports "SURVIVED" and looks like a product gap.
  local applied=0
  for f in "${MUTATED_FILES[@]}"; do
    cmp -s "$SNAP/$f" "$f" || applied=1
  done
  if [ "$applied" -eq 0 ]; then
    echo "ERROR    $name  <-- mutant never applied (fix the pattern)"
    survived=$((survived + 1))
    return
  fi

  if [ "$scope" = mobile ]; then
    out=$(cd "$MOBILE" && flutter test $target 2>&1)
    rc=$?
  else
    out=$(node "$PROBE" 2>&1)
    rc=$?
  fi
  if [ $rc -ne 0 ]; then
    killed=$((killed + 1))
    printf 'KILLED   %s\n' "$name"
  else
    survived=$((survived + 1))
    printf 'SURVIVED %s  <-- GUARANTEE NOT TESTED\n' "$name"
  fi
  restore
  verify_restored || exit 1
}

echo "=== CP16 mutation pass ==="

# Baseline: the suite must be GREEN before mutating, otherwise every mutant
# "dies" for an unrelated reason and the whole pass is meaningless.
echo "Checking baseline..."
if ! (cd "$MOBILE" && flutter test >/dev/null 2>&1); then
  echo "FATAL: mobile suite is already failing; fix it before mutation testing."
  exit 1
fi
if ! node "$PROBE" >/dev/null 2>&1; then
  echo "FATAL: wire probe is already failing; fix it before mutation testing."
  exit 1
fi
echo "Baseline green."
echo

# M1 — queue wholesale deletion on unknown/new fields.
# Re-introduce the exact key-count check B-3 removed.
perl -0pi -e "s/    \/\/ Required keys only\. Unknown keys are tolerated on purpose: see the class doc\./    if (value.keys.length != 4) {\n      return null;\n    }/" "$EV"
run_mutant "M1 unknown-field rejection (B-3 regression)" mobile ""

# M2 — regenerated clientEventId across reload.
perl -0pi -e "s/      clientEventId: clientEventId,\n      cardId: cardId,/      clientEventId: '\\\$clientEventId-remint',\n      cardId: cardId,/" "$EV"
run_mutant "M2 clientEventId re-minted on restore" mobile ""

# M3 — legacy event falsely acquiring a response.
perl -0pi -e "s/    BinaryResponse\? response;\n    if \(value\.containsKey\('response'\)\) \{/    BinaryResponse? response = BinaryResponse.known;\n    if (value.containsKey('response')) {/" "$EV"
run_mutant "M3 legacy event defaults to known" mobile ""

# M4 — known/unknown shadow mapping inversion.
perl -0pi -e "s/ReviewGrade\.remembered/ReviewGrade.__TMP__/; s/ReviewGrade\.forgot/ReviewGrade.remembered/; s/ReviewGrade\.__TMP__/ReviewGrade.forgot/" "$BR"
run_mutant "M4 shadow grade mapping inverted" mobile ""

# M5 — native emits grade AND response together (ambiguous wire item).
perl -0pi -e "s/        if \(response != null\)\n          'response': response!\.name\n        else\n          'grade': grade\.name,/        if (response != null) 'response': response!.name,\n        'grade': grade.name,/" "$EV"
run_mutant "M5 wire sends grade+response together" mobile ""

# M6 — retry/idempotency regression: queue drops the whole batch on one bad event.
perl -0pi -e "s/        \/\/ One bad or duplicated entry quarantines ITSELF, not its neighbours\.\n        rejected\.add\(value\);\n        continue;/        return _quarantineWhole(serialized);/" "$QU"
run_mutant "M6 one malformed event discards the queue" mobile ""

# M7 — accidental Scheduler V2 coupling: the probe must not need V2 to pass.
# Mutate the probe's own flag discipline assertion so binary-with-flag-off is
# expected to be ACCEPTED; if nothing notices, flag discipline is untested.
# Formatting-agnostic: flip the assertion for the off-flag-2 case whatever the
# line wrapping is. Prettier reflowed this call once and silently broke a
# single-line pattern, which is exactly what the applied-mutant guard caught.
perl -0pi -e "s/expectReject\(\s*'binary refused while the flag is OFF/expectOk(\n  'binary refused while the flag is OFF/" "$PROBE"
run_mutant "M7 binary accepted with flag OFF (V2/flag discipline)" probe ""

echo
echo "killed=$killed survived=$survived"
[ "$survived" -eq 0 ] || exit 1
echo "ALL CP16 MUTANTS KILLED"
