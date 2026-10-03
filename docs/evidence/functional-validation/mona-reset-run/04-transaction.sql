-- ============================================================================
-- ARCHIVED EVIDENCE — ALREADY EXECUTED 2026-10-03. DO NOT RUN.
-- This is the exact transaction that reset Mona's learner state in Production.
-- It is retained verbatim as evidence, not as a tool. Re-running it is a no-op
-- at best (preconditions assert 39/15/1/1 rows that no longer exist) and the
-- guard below aborts it regardless.
-- ============================================================================
\echo ARCHIVED EVIDENCE - ALREADY EXECUTED - DO NOT RUN
DO $guard$ BEGIN RAISE EXCEPTION 'ARCHIVED EVIDENCE: this transaction already executed on 2026-10-03 and must not be re-run'; END $guard$;

-- FV Mona-only learner-state reset. Owner-approved 2026-10-03.
-- Recovery point: snap-ancient-band-asqfztci (verified on br-purple-night-as1ji0k0)
-- Mona   = b4efb0a4-d829-4f33-b686-0f498fbef62c  -> learner state DELETED
-- Bahram = 451b0433-7204-44e9-957f-250cac59e28e  -> MUST remain untouched (isolation control)
-- Fail closed: any assertion raises, transaction aborts, zero rows deleted.
\set ON_ERROR_STOP on
\timing off
\pset tuples_only on

BEGIN;

-- Serialize against concurrent learner writes on the target rows only.
LOCK TABLE review_events, card_schedules, learner_daily_plans,
           learner_reconciliation_cursors, review_event_rejections,
           mobile_learner_sessions IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  mona uuid := 'b4efb0a4-d829-4f33-b686-0f498fbef62c';
  bah  uuid := '451b0433-7204-44e9-957f-250cac59e28e';
  v_int bigint;
  v_txt text;
BEGIN
  -- P1 exactly two users
  SELECT count(*) INTO v_int FROM users;
  IF v_int <> 2 THEN RAISE EXCEPTION 'PRE P1 users=% expected 2', v_int; END IF;

  -- P2 both accounts present
  SELECT count(*) INTO v_int FROM users WHERE id IN (mona, bah);
  IF v_int <> 2 THEN RAISE EXCEPTION 'PRE P2 target accounts=% expected 2', v_int; END IF;

  -- P3 Mona exact pre-reset counts
  SELECT count(*) INTO v_int FROM review_events WHERE user_id=mona;
  IF v_int <> 39 THEN RAISE EXCEPTION 'PRE P3a mona_ev=% expected 39', v_int; END IF;
  SELECT count(*) INTO v_int FROM card_schedules WHERE user_id=mona;
  IF v_int <> 15 THEN RAISE EXCEPTION 'PRE P3b mona_sch=% expected 15', v_int; END IF;
  SELECT count(*) INTO v_int FROM learner_daily_plans WHERE user_id=mona;
  IF v_int <> 1  THEN RAISE EXCEPTION 'PRE P3c mona_plans=% expected 1', v_int; END IF;
  SELECT count(*) INTO v_int FROM learner_reconciliation_cursors WHERE user_id=mona;
  IF v_int <> 1  THEN RAISE EXCEPTION 'PRE P3d mona_cur=% expected 1', v_int; END IF;
  SELECT count(*) INTO v_int FROM review_event_rejections WHERE user_id=mona;
  IF v_int <> 0  THEN RAISE EXCEPTION 'PRE P3e mona_rej=% expected 0', v_int; END IF;
  SELECT count(*) INTO v_int FROM mobile_learner_sessions WHERE user_id=mona;
  IF v_int <> 0  THEN RAISE EXCEPTION 'PRE P3f mona_mob=% expected 0', v_int; END IF;

  -- P4 Bahram counts
  SELECT count(*) INTO v_int FROM review_events WHERE user_id=bah;
  IF v_int <> 58 THEN RAISE EXCEPTION 'PRE P4a bah_ev=% expected 58', v_int; END IF;
  SELECT count(*) INTO v_int FROM card_schedules WHERE user_id=bah;
  IF v_int <> 16 THEN RAISE EXCEPTION 'PRE P4b bah_sch=% expected 16', v_int; END IF;
  SELECT count(*) INTO v_int FROM learner_reconciliation_cursors WHERE user_id=bah;
  IF v_int <> 1  THEN RAISE EXCEPTION 'PRE P4c bah_cur=% expected 1', v_int; END IF;

  -- P5 Bahram canonical combined digest
  SELECT md5(
         coalesce((SELECT md5(string_agg(t::text,'|' ORDER BY t.id))      FROM review_events t                  WHERE t.user_id=bah),'-')
  ||'/'||coalesce((SELECT md5(string_agg(t::text,'|' ORDER BY t.card_id)) FROM card_schedules t                 WHERE t.user_id=bah),'-')
  ||'/'||coalesce((SELECT md5(string_agg(t::text,'|' ORDER BY t.user_id)) FROM learner_reconciliation_cursors t WHERE t.user_id=bah),'-')
  ) INTO v_txt;
  IF v_txt <> 'f6f477b2f42a957a15092871655eb277' THEN
    RAISE EXCEPTION 'PRE P5 bah_combined=% expected f6f477b2f42a957a15092871655eb277', v_txt; END IF;

  -- P6 catalog
  SELECT count(*) INTO v_int FROM cards;
  IF v_int <> 35 THEN RAISE EXCEPTION 'PRE P6a cards=% expected 35', v_int; END IF;
  SELECT md5(string_agg(t::text,'|' ORDER BY t.id)) INTO v_txt FROM cards t;
  IF v_txt <> '8cd0abc62c29f6d3c83574d8e7bd8e2d' THEN
    RAISE EXCEPTION 'PRE P6b cards_md5=% drifted', v_txt; END IF;

  -- P7 revoked_sessions
  SELECT count(*) INTO v_int FROM revoked_sessions;
  IF v_int <> 7 THEN RAISE EXCEPTION 'PRE P7a revoked=% expected 7', v_int; END IF;
  SELECT md5(string_agg(t::text,'|' ORDER BY t.session_id)) INTO v_txt FROM revoked_sessions t;
  IF v_txt <> '6c89b1a2ed6caab532d69030aab8a0be' THEN
    RAISE EXCEPTION 'PRE P7b revoked_md5=% drifted', v_txt; END IF;

  -- P8 schema fingerprint (7 relevant tables)
  SELECT md5(string_agg(c.relname||':'||a.attname||':'||format_type(a.atttypid,a.atttypmod),'|'
               ORDER BY c.relname,a.attnum)) INTO v_txt
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid
   WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped
     AND c.relname IN ('review_events','card_schedules','learner_daily_plans',
          'learner_reconciliation_cursors','review_event_rejections',
          'mobile_learner_sessions','users');
  IF v_txt <> '0348784c84461e1bb7068411a8d33bcf' THEN
    RAISE EXCEPTION 'PRE P8 schema_md5=% drifted', v_txt; END IF;

  -- P9 migration head
  SELECT version INTO v_txt FROM schema_migrations ORDER BY version DESC LIMIT 1;
  IF v_txt <> '0023_learning_persistence' THEN
    RAISE EXCEPTION 'PRE P9 mig_head=% expected 0023_learning_persistence', v_txt; END IF;

  RAISE NOTICE 'ALL 9 PRECONDITIONS PASSED - proceeding with Mona-only delete';
END $$;

-- ---------- the six scoped deletions (Mona only) ----------
DELETE FROM review_events                  WHERE user_id = 'b4efb0a4-d829-4f33-b686-0f498fbef62c';
DELETE FROM card_schedules                 WHERE user_id = 'b4efb0a4-d829-4f33-b686-0f498fbef62c';
DELETE FROM learner_daily_plans            WHERE user_id = 'b4efb0a4-d829-4f33-b686-0f498fbef62c';
DELETE FROM learner_reconciliation_cursors WHERE user_id = 'b4efb0a4-d829-4f33-b686-0f498fbef62c';
DELETE FROM review_event_rejections        WHERE user_id = 'b4efb0a4-d829-4f33-b686-0f498fbef62c';
DELETE FROM mobile_learner_sessions        WHERE user_id = 'b4efb0a4-d829-4f33-b686-0f498fbef62c';

DO $$
DECLARE
  mona uuid := 'b4efb0a4-d829-4f33-b686-0f498fbef62c';
  bah  uuid := '451b0433-7204-44e9-957f-250cac59e28e';
  v_int bigint;
  v_txt text;
BEGIN
  -- Q1 Mona zero across all six
  SELECT count(*) INTO v_int FROM review_events WHERE user_id=mona;
  IF v_int <> 0 THEN RAISE EXCEPTION 'POST Q1a mona_ev=% expected 0', v_int; END IF;
  SELECT count(*) INTO v_int FROM card_schedules WHERE user_id=mona;
  IF v_int <> 0 THEN RAISE EXCEPTION 'POST Q1b mona_sch=% expected 0', v_int; END IF;
  SELECT count(*) INTO v_int FROM learner_daily_plans WHERE user_id=mona;
  IF v_int <> 0 THEN RAISE EXCEPTION 'POST Q1c mona_plans=% expected 0', v_int; END IF;
  SELECT count(*) INTO v_int FROM learner_reconciliation_cursors WHERE user_id=mona;
  IF v_int <> 0 THEN RAISE EXCEPTION 'POST Q1d mona_cur=% expected 0', v_int; END IF;
  SELECT count(*) INTO v_int FROM review_event_rejections WHERE user_id=mona;
  IF v_int <> 0 THEN RAISE EXCEPTION 'POST Q1e mona_rej=% expected 0', v_int; END IF;
  SELECT count(*) INTO v_int FROM mobile_learner_sessions WHERE user_id=mona;
  IF v_int <> 0 THEN RAISE EXCEPTION 'POST Q1f mona_mob=% expected 0', v_int; END IF;

  -- Q2 Mona account retained
  SELECT count(*) INTO v_int FROM users WHERE id=mona;
  IF v_int <> 1 THEN RAISE EXCEPTION 'POST Q2 mona account=% expected 1', v_int; END IF;

  -- Q3 users still exactly 2
  SELECT count(*) INTO v_int FROM users;
  IF v_int <> 2 THEN RAISE EXCEPTION 'POST Q3 users=% expected 2', v_int; END IF;

  -- Q4 Bahram counts untouched
  SELECT count(*) INTO v_int FROM review_events WHERE user_id=bah;
  IF v_int <> 58 THEN RAISE EXCEPTION 'POST Q4a bah_ev=% expected 58', v_int; END IF;
  SELECT count(*) INTO v_int FROM card_schedules WHERE user_id=bah;
  IF v_int <> 16 THEN RAISE EXCEPTION 'POST Q4b bah_sch=% expected 16', v_int; END IF;
  SELECT count(*) INTO v_int FROM learner_reconciliation_cursors WHERE user_id=bah;
  IF v_int <> 1  THEN RAISE EXCEPTION 'POST Q4c bah_cur=% expected 1', v_int; END IF;

  -- Q5 Bahram digest byte-identical
  SELECT md5(
         coalesce((SELECT md5(string_agg(t::text,'|' ORDER BY t.id))      FROM review_events t                  WHERE t.user_id=bah),'-')
  ||'/'||coalesce((SELECT md5(string_agg(t::text,'|' ORDER BY t.card_id)) FROM card_schedules t                 WHERE t.user_id=bah),'-')
  ||'/'||coalesce((SELECT md5(string_agg(t::text,'|' ORDER BY t.user_id)) FROM learner_reconciliation_cursors t WHERE t.user_id=bah),'-')
  ) INTO v_txt;
  IF v_txt <> 'f6f477b2f42a957a15092871655eb277' THEN
    RAISE EXCEPTION 'POST Q5 bah_combined=% CHANGED', v_txt; END IF;

  -- Q6 Bahram xmin unchanged: proves no row was updated/deleted/reinserted
  SELECT md5(string_agg(t.xmin::text,'|' ORDER BY t.id)) INTO v_txt FROM review_events t WHERE t.user_id=bah;
  IF v_txt <> 'b9b103fa7525cc76a332ceac1bc3ec25' THEN
    RAISE EXCEPTION 'POST Q6a bah_ev_xmin=% CHANGED', v_txt; END IF;
  SELECT md5(string_agg(t.xmin::text,'|' ORDER BY t.card_id)) INTO v_txt FROM card_schedules t WHERE t.user_id=bah;
  IF v_txt <> 'a733156634d5c6c24fdefa05874d2e8d' THEN
    RAISE EXCEPTION 'POST Q6b bah_sch_xmin=% CHANGED', v_txt; END IF;

  -- Q7 totals now Bahram-only
  SELECT count(*) INTO v_int FROM review_events;
  IF v_int <> 58 THEN RAISE EXCEPTION 'POST Q7a total_ev=% expected 58', v_int; END IF;
  SELECT count(*) INTO v_int FROM card_schedules;
  IF v_int <> 16 THEN RAISE EXCEPTION 'POST Q7b total_sch=% expected 16', v_int; END IF;
  SELECT count(*) INTO v_int FROM learner_daily_plans;
  IF v_int <> 0  THEN RAISE EXCEPTION 'POST Q7c total_plans=% expected 0', v_int; END IF;

  -- Q8 catalog untouched
  SELECT count(*) INTO v_int FROM cards;
  IF v_int <> 35 THEN RAISE EXCEPTION 'POST Q8a cards=% expected 35', v_int; END IF;
  SELECT md5(string_agg(t::text,'|' ORDER BY t.id)) INTO v_txt FROM cards t;
  IF v_txt <> '8cd0abc62c29f6d3c83574d8e7bd8e2d' THEN
    RAISE EXCEPTION 'POST Q8b cards_md5 CHANGED'; END IF;

  -- Q9 revoked_sessions untouched (clearing could resurrect revoked sessions)
  SELECT count(*) INTO v_int FROM revoked_sessions;
  IF v_int <> 7 THEN RAISE EXCEPTION 'POST Q9a revoked=% expected 7', v_int; END IF;
  SELECT md5(string_agg(t::text,'|' ORDER BY t.session_id)) INTO v_txt FROM revoked_sessions t;
  IF v_txt <> '6c89b1a2ed6caab532d69030aab8a0be' THEN
    RAISE EXCEPTION 'POST Q9b revoked_md5 CHANGED'; END IF;

  -- Q10 auth surface untouched
  SELECT count(*) INTO v_int FROM otp_challenges;
  IF v_int <> 37 THEN RAISE EXCEPTION 'POST Q10a otp_challenges=% expected 37', v_int; END IF;
  SELECT count(*) INTO v_int FROM otp_request_events;
  IF v_int <> 37 THEN RAISE EXCEPTION 'POST Q10b otp_request_events=% expected 37', v_int; END IF;
  SELECT count(*) INTO v_int FROM invite_codes;
  IF v_int <> 3  THEN RAISE EXCEPTION 'POST Q10c invite_codes=% expected 3', v_int; END IF;

  RAISE NOTICE 'ALL 10 POST-ASSERTION GROUPS PASSED - committing';
END $$;

COMMIT;

\echo '--- post-commit state ---'
SELECT 'mona_ev='||count(*) FROM review_events WHERE user_id='b4efb0a4-d829-4f33-b686-0f498fbef62c';
SELECT 'mona_account='||count(*) FROM users WHERE id='b4efb0a4-d829-4f33-b686-0f498fbef62c';
SELECT 'total_ev='||count(*) FROM review_events;
SELECT 'total_sch='||count(*) FROM card_schedules;
SELECT 'total_plans='||count(*) FROM learner_daily_plans;
SELECT 'users='||count(*) FROM users;
