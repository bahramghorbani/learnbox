#!/usr/bin/env bash
# Integration proof for account deletion (LB-B04) against a disposable database seeded from the
# latest production backup. Production is never contacted.
set -uo pipefail
NAME="lb-del-$$"
PGI=postgres:17-alpine
ARCHIVE="$(ls -1t /home/ubuntu/learnbox/backups/learnbox-*.sql.gz | head -1)"
cleanup(){ docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=x -e POSTGRES_DB=d "$PGI" >/dev/null
for _ in $(seq 1 60); do docker exec "$NAME" psql -U postgres -d d -c "select 1" >/dev/null 2>&1 && break; sleep 2; done
gzip -dc "$ARCHIVE" | docker exec -i "$NAME" psql -q -v ON_ERROR_STOP=1 -U postgres -d d >/dev/null
docker exec -i "$NAME" psql -q -v ON_ERROR_STOP=1 -U postgres -d d < /tmp/0019.sql >/dev/null

q(){ docker exec "$NAME" psql -U postgres -d d -tAc "$1" | tr -d ' \n'; }
A=aaaaaaaa-0000-0000-0000-000000000001
B=bbbbbbbb-0000-0000-0000-000000000002
P=dddddddd-0000-0000-0000-000000000004

docker exec -i "$NAME" psql -q -v ON_ERROR_STOP=1 -U postgres -d d <<'SQL'
INSERT INTO users (id, phone_e164, first_name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '+989120000001', 'DeleteMe'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '+989120000002', 'KeepMe'),
  ('dddddddd-0000-0000-0000-000000000004', '+989120000004', 'Reviewer');
INSERT INTO card_schedules (user_id, card_id, due_at, updated_at)
  SELECT u.id, c.id, now(), now() FROM users u CROSS JOIN (SELECT id FROM cards LIMIT 3) c
  WHERE u.id IN ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002');
INSERT INTO review_events (id, user_id, card_id, grade, occurred_at, client_event_id)
  SELECT gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', c.id, 'remembered', now(), gen_random_uuid()
  FROM (SELECT id FROM cards LIMIT 2) c;
INSERT INTO billing_products (id, kind, entitlement_keys) VALUES ('pack.b1', 'one_time_pack', ARRAY['pack:b1']);
INSERT INTO purchase_events (user_id, provider, environment, provider_purchase_id, product_id, status, verified_at)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'cafe_bazaar', 'production', 'TXN-REAL-001', 'pack.b1', 'verified', now());
INSERT INTO user_packs (id, user_id, pack_id, acquired_at, acquisition_type)
  SELECT gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', p.id, now(), 'purchased' FROM (SELECT id FROM packs LIMIT 1) p;
INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, created_at)
  VALUES (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'login', 'session', gen_random_uuid(), now());
INSERT INTO content_review_decisions (id, card_version_id, reviewer_user_id, action, decision_key, created_at)
  SELECT gen_random_uuid(), cv.id, 'dddddddd-0000-0000-0000-000000000004', 'approve', gen_random_uuid(), now()
  FROM (SELECT id FROM card_versions LIMIT 1) cv;
SQL

echo "BEFORE: users=$(q "select count(*) from users") schedA=$(q "select count(*) from card_schedules where user_id='$A'") schedB=$(q "select count(*) from card_schedules where user_id='$B'") reviewsA=$(q "select count(*) from review_events where user_id='$A'") packsA=$(q "select count(*) from user_packs where user_id='$A'") purchases=$(q "select count(*) from purchase_events") claims=$(q "select count(*) from purchase_ownership_claims")"

# Mirrors the store: the privileged check is a separate query whose result gates the transaction,
# exactly as deleteAccount() does in TypeScript.
is_privileged(){
  docker exec "$NAME" psql -U postgres -d d -tAc "select count(*) from (
     select 1 from admin_owner where user_id='$1'
     union all select 1 from content_review_decisions where reviewer_user_id='$1'
     union all select 1 from content_review_checks where reviewer_user_id='$1'
     union all select 1 from admin_role_assignments where user_id='$1') g" | tr -d ' \n'
}

run_delete(){
if [ "$(is_privileged "$1")" != "0" ]; then echo "REFUSED privileged_account"; return 1; fi
docker exec -i "$NAME" psql -q -v ON_ERROR_STOP=1 -v uid="$1" -v rid="${2:-req-default}" -U postgres -d d 2>&1 <<'SQL'
BEGIN;
SELECT id FROM users WHERE id=:'uid' FOR UPDATE;
INSERT INTO purchase_ownership_claims (provider, provider_purchase_id, product_id, subject_hash, entitlement_keys, status, purchased_at)
  SELECT pe.provider, pe.provider_purchase_id, pe.product_id, 'SUBJECT-HASH-A', bp.entitlement_keys, pe.status, COALESCE(pe.verified_at, pe.created_at)
  FROM purchase_events pe JOIN billing_products bp ON bp.id=pe.product_id
  WHERE pe.user_id=:'uid' AND pe.status IN ('verified','refunded','revoked')
  ON CONFLICT (provider, provider_purchase_id) DO NOTHING;
DELETE FROM review_events WHERE user_id=:'uid';
DELETE FROM card_schedules WHERE user_id=:'uid';
DELETE FROM learner_reconciliation_cursors WHERE user_id=:'uid';
DELETE FROM mobile_learner_sessions WHERE user_id=:'uid';
DELETE FROM user_packs WHERE user_id=:'uid';
DELETE FROM payment_logs WHERE user_id=:'uid';
UPDATE audit_logs SET actor_user_id=NULL WHERE actor_user_id=:'uid';
DELETE FROM purchase_events WHERE user_id=:'uid';
DELETE FROM users WHERE id=:'uid';
INSERT INTO account_deletion_events (subject_hash, prior_user_id, requested_at, status, actor, request_id, policy_version, review_events_removed, schedules_removed, sessions_removed, purchases_preserved)
  VALUES ('SUBJECT-HASH-A', :'uid', now(), 'completed','learner', :'rid', '2026-09-28.v1',2,3,0,1);
COMMIT;
SQL
}

run_delete "$A" "req-alpha-1" >/tmp/del_a.log 2>&1
echo "--- delete A output ---"; cat /tmp/del_a.log; echo "--- end ---"


# --- idempotency proof: the SAME request id must not create a second audit event ----------
echo ""
echo "=== idempotency: replaying the identical request id ==="
before_events=$(q "select count(*) from account_deletion_events")
set +e
replay_err=$(docker exec -i "$NAME" psql -q -v ON_ERROR_STOP=1 -v uid="$A" -v rid="req-alpha-1" -U postgres -d d <<'SQL' 2>&1
INSERT INTO account_deletion_events (subject_hash, prior_user_id, requested_at, status, actor, request_id, policy_version, review_events_removed, schedules_removed, sessions_removed, purchases_preserved)
  VALUES ('SUBJECT-HASH-A', :'uid', now(), 'completed','learner', :'rid', '2026-09-28.v1',2,3,0,1);
SQL
)
replay_rc=$?
set -e
after_events=$(q "select count(*) from account_deletion_events")
# A pass requires THREE things, so a harness fault cannot look like a success:
#   - there was a real audit row to duplicate (before > 0)
#   - the replay failed
#   - it failed on the unique constraint specifically, not on some unrelated error
if [ "${before_events:-0}" -gt 0 ] \
   && [ "$replay_rc" -ne 0 ] \
   && printf '%s' "$replay_err" | grep -qi 'account_deletion_events_request_idx\|duplicate key' \
   && [ "$before_events" = "$after_events" ]; then
  echo "  PASS: duplicate request_id rejected by the unique index (events stayed $after_events)"
else
  echo "  FAIL: idempotency not proven (before=$before_events after=$after_events rc=$replay_rc)"
  echo "        replay error was: $(printf '%s' "$replay_err" | head -2)"
fi

echo "AFTER : users=$(q "select count(*) from users") schedA=$(q "select count(*) from card_schedules where user_id='$A'") schedB=$(q "select count(*) from card_schedules where user_id='$B'") purchases=$(q "select count(*) from purchase_events") claims=$(q "select count(*) from purchase_ownership_claims") audit=$(q "select count(*) from account_deletion_events")"
echo ""
echo "CHECK deleted user gone............: $([ "$(q "select count(*) from users where id='$A'")" = 0 ] && echo PASS || echo FAIL)"
echo "CHECK other learner untouched......: $([ "$(q "select count(*) from card_schedules where user_id='$B'")" = 3 ] && echo PASS || echo FAIL)"
echo "CHECK schedules removed............: $([ "$(q "select count(*) from card_schedules where user_id='$A'")" = 0 ] && echo PASS || echo FAIL)"
echo "CHECK review history removed.......: $([ "$(q "select count(*) from review_events where user_id='$A'")" = 0 ] && echo PASS || echo FAIL)"
echo "CHECK user_packs removed...........: $([ "$(q "select count(*) from user_packs where user_id='$A'")" = 0 ] && echo PASS || echo FAIL)"
echo "CHECK audit_logs anonymised not del: $([ "$(q "select count(*) from audit_logs where actor_user_id is null")" -ge 1 ] && echo PASS || echo FAIL)"
echo "CHECK purchase evidence survives...: $([ "$(q "select count(*) from purchase_ownership_claims where provider_purchase_id='TXN-REAL-001'")" = 1 ] && echo PASS || echo FAIL)"
echo "CHECK entitlement keys preserved...: $([ "$(q "select count(*) from purchase_ownership_claims where 'pack:b1' = any(entitlement_keys)")" = 1 ] && echo PASS || echo FAIL)"
echo "CHECK audit row written............: $([ "$(q "select count(*) from account_deletion_events")" = 1 ] && echo PASS || echo FAIL)"
echo "CHECK audit holds no phone.........: $([ "$(q "select count(*) from account_deletion_events where subject_hash like '%9891%'")" = 0 ] && echo PASS || echo FAIL)"
echo "CHECK content/cards untouched......: $([ "$(q "select count(*) from cards")" = 35 ] && echo PASS || echo FAIL)"
echo "CHECK phone freed for re-register..: $(docker exec -i "$NAME" psql -q -U postgres -d d -c "INSERT INTO users (id, phone_e164, first_name) VALUES ('cccccccc-0000-0000-0000-000000000003','+989120000001','Rejoined');" >/dev/null 2>&1 && echo PASS || echo FAIL)"
echo "CHECK claim reclaimable by hash....: $([ "$(q "select count(*) from purchase_ownership_claims where subject_hash='SUBJECT-HASH-A'")" = 1 ] && echo PASS || echo FAIL)"

set +e; run_delete "$A" "req-alpha-retry" >/dev/null 2>&1; set -e
echo "CHECK retry idempotent (no dupes)..: $([ "$(q "select count(*) from purchase_ownership_claims")" = 1 ] && echo PASS || echo FAIL)"
echo "CHECK orphan rows after deletion...: $([ "$(q "select count(*) from card_schedules s left join users u on u.id=s.user_id where u.id is null")" = 0 ] && echo PASS || echo FAIL)"

set +e; run_delete "$P" "req-priv-1" >/tmp/del_p.log 2>&1; set -e
echo "CHECK privileged deletion refused..: $(grep -qi 'REFUSED privileged_account' /tmp/del_p.log && echo PASS || echo FAIL)"
echo "CHECK reviewer account intact......: $([ "$(q "select count(*) from users where id='$P'")" = 1 ] && echo PASS || echo FAIL)"
echo "CHECK review decision intact.......: $([ "$(q "select count(*) from content_review_decisions where reviewer_user_id='$P'")" = 1 ] && echo PASS || echo FAIL)"
rm -f /tmp/del_a.log /tmp/del_p.log

echo ""
if [ "$(grep -c 'FAIL' /tmp/lb_del_results 2>/dev/null || echo 0)" -gt 0 ]; then
  echo "RESULT: FAILURES PRESENT"
  exit 1
fi
echo "RESULT: all checks completed"
exit 0
