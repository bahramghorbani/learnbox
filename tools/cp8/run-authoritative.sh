#!/usr/bin/env bash
# CP8 remediated authoritative run. One controlled sequence, one log, no reused outputs.
#
# Order matters and is the point:
#   1. destroy and rebuild the isolated staging schema from the repository migration path (0001-0022)
#   2. seed synthetic fixtures (no Production data is ever copied)
#   3. fingerprint the pre-0023 baseline
#   4. apply ONLY 0023 via the repository migration runner, then re-apply to prove it is a no-op
#   5. prove 0023 changed nothing (full digests incl. response + engine_version)
#   6. V1 equivalence / V2 activation / provenance / idempotency
#   7. fail-closed, boundary, transient, queue and session behaviour
#   8. boundary sweep at every Box edge
#   9. rollback rehearsal
#  10. reconcile every synthetic write against the mutation ledger
set -uo pipefail

cd "$(dirname "$0")/../.."
REPO="$PWD"
OUT="${CP8_OUT:-/tmp/cp8}"
RUN_ID="r2-$(date -u +%Y%m%dT%H%M%SZ)"
LOG="$OUT/authoritative-$RUN_ID.log"
LEDGER="$OUT/ledger-$RUN_ID.jsonl"

mkdir -p "$OUT"
: > "$LEDGER"

# The staging DSN (with its password and CA path) is supplied by the OPERATOR via the environment.
# It is deliberately NOT written into this file so the harness can be committed without a credential.
# Example (do not commit a real one):
#   export STAGING_DATABASE_URL='postgres://postgres:<pw>@localhost:55443/learnbox_staging?sslmode=verify-full&sslrootcert=/tmp/cp8/staging-ca.crt'
if [ -z "${STAGING_DATABASE_URL:-}" ]; then
  echo "FATAL: STAGING_DATABASE_URL is not set." >&2
  echo "Export the isolated staging DSN before running. Never point this at Production." >&2
  exit 2
fi
case "$STAGING_DATABASE_URL" in
  *localhost*|*127.0.0.1*) : ;;
  *) echo "FATAL: refusing to run against a non-local host. CP8 is isolated-staging only." >&2; exit 2 ;;
esac
export STAGING_DATABASE_URL
export CP8_LEDGER="$LEDGER"
export CP8_RUN_ID="$RUN_ID"
export CP8_FP_DIR="$OUT"

step() { echo; echo "########## $* ##########"; }
rc_total=0
run() { # run <label> <cmd...>
  local label="$1"; shift
  "$@" 2>&1 | grep -vE 'MODULE_TYPELESS|Reparsing|--experimental|trace-warnings|^\(node:'
  local rc=${PIPESTATUS[0]}
  echo "exit_${label}=${rc}"
  rc_total=$(( rc_total + rc ))
}

{
  echo "CP8 AUTHORITATIVE REMEDIATED RUN"
  echo "run_id=$RUN_ID"
  echo "started_utc=$(date -u +%FT%TZ)"
  echo "candidate_sha=$(git rev-parse HEAD)"
  echo "worktree_clean_tracked=$([ -z "$(git status --porcelain --untracked-files=no)" ] && echo yes || echo NO)"
  echo "node=$(node --version)"
  echo "ledger=$LEDGER"

  step "0. isolated staging database identity (Production must be untouched)"
  docker exec lb-cp8-pg psql -U postgres -At -c \
    "select 'db='||current_database()||' port=5432 container=lb-cp8-pg';" learnbox_staging
  echo "dsn_host=localhost:55443 (isolated docker container, not Production)"

  step "1. rebuild baseline: repository migration path 0001 -> 0022"
  docker exec lb-cp8-pg psql -U postgres -q -c \
    "drop schema public cascade; create schema public;" learnbox_staging >/dev/null 2>&1
  run migrations_0001_0022 node tools/cp8/apply-migrations.mjs 0001 0022

  step "2. seed synthetic fixtures"
  run seed node tools/cp8/seed.mjs

  step "3. fingerprint the PRE-0023 baseline"
  run fingerprint_pre node tools/cp8/migration-proof.mjs pre

  step "4. apply ONLY migration 0023 (repository migration runner)"
  run migration_0023 node tools/cp8/apply-migrations.mjs 0023 0023

  step "5. prove 0023 is additive and changed no existing data"
  run migration_post node tools/cp8/migration-proof.mjs post

  step "6. re-apply 0023 and prove it is a no-op"
  run migration_reapply_exec node tools/cp8/apply-migrations.mjs 0023 0023
  run migration_reapply node tools/cp8/migration-proof.mjs reapply

  step "7. V1 equivalence, V2 activation, provenance, idempotency"
  run e2e node tools/cp8/e2e.mjs

  step "8. fail-closed, transient, client classification, queue and session safety"
  run failclosed node tools/cp8/failclosed.mjs

  step "9. boundary sweep at every Box edge"
  run sweep node tools/cp8/sweep.mjs

  step "10. rollback rehearsal"
  run rollback node tools/cp8/rollback.mjs

  step "11. final state + write accounting"
  run accounting node tools/cp8/accounting.mjs

  step "12. final database state (verbatim)"
  docker exec lb-cp8-pg psql -U postgres -At -c \
    "select 'event: '||client_event_id||' engine_version='||coalesce(engine_version::text,'NULL')||
            ' response='||coalesce(response,'NULL')||' grade='||grade
       from review_events order by client_event_id;" learnbox_staging
  docker exec lb-cp8-pg psql -U postgres -At -c \
    "select 'sched: user='||substring(cs.user_id::text,1,8)||' card='||c.content_id||
            ' stability='||cs.stability_days||' state='||cs.state
       from card_schedules cs join cards c on c.id = cs.card_id
      order by cs.user_id, c.content_id;" learnbox_staging

  echo
  echo "finished_utc=$(date -u +%FT%TZ)"
  echo "AUTHORITATIVE_RUN_EXIT_SUM=${rc_total}"
  echo "AUTHORITATIVE_RUN_VERDICT=$([ "$rc_total" -eq 0 ] && echo ALL_GREEN || echo FAILURES_PRESENT)"
} 2>&1 | tee "$LOG"

echo
echo "log=$LOG"
echo "ledger=$LEDGER"
exit "$rc_total"
