-- 0029_support_pack_entitlements.sql
--
-- Phase 3 / Milestone 3.2: manual pack grant and revoke by authorized Admin support staff.
--
-- The canonical entitlement stays exactly where it is. A learner owns a pack because a row exists
-- in `user_packs` (0022), and `apps/website/lib/pack-access.ts` remains the one definition of
-- access. This migration adds NO table, NO second entitlement model and NO payment record.
--
-- The one thing the canonical model could not express
-- ---------------------------------------------------
-- `user_packs.acquisition_type` was constrained to ('free', 'purchased'):
--
--   * 'free'      — M2.3 self-service activation of a free pack.
--   * 'purchased' — M2.4 entitlement granted from a VERIFIED payment, with `purchase_event_id`
--                   pointing at the immutable transaction.
--
-- A support-issued entitlement is neither. Writing it as 'free' would claim the learner activated
-- it themselves; writing it as 'purchased' would claim money changed hands — and with no
-- `purchase_event_id` it would also be a paid entitlement with no transaction behind it, which is
-- precisely the falsified payment history that must never exist. Support would then be unable to
-- tell, later, whether a learner paid or was helped, and revoke could not refuse to destroy a real
-- purchase because it could no longer recognise one.
--
-- So the acquisition vocabulary gains its third real value, 'support'. That is the smallest
-- additive change that keeps provenance truthful: one CHECK constraint widened, no column added, no
-- existing row touched, no existing write path changed.
--
-- Provenance invariant, enforced by the database rather than by convention: only a 'purchased'
-- entitlement may carry a `purchase_event_id`. A support grant or a free activation pointing at a
-- transaction would be a fabricated payment link, so the constraint refuses it outright.
--
-- Forward-only and idempotent. Existing 'free' and 'purchased' rows satisfy both constraints, so
-- revalidation cannot fail and no data is rewritten.
--
-- No transaction control in this file (the explicit BEGIN/COMMIT it was written with has been
-- removed before it was ever applied to production): the runner in
-- apps/api/src/database/migration-runner.ts already wraps each migration and its ledger row in ONE
-- transaction. A file that commits for itself ends that transaction early — the DDL lands, the
-- ledger row does not, and a later failure can no longer be rolled back, which leaves the schema
-- applied but unrecorded and the next release run hitting "already exists". Proven in
-- apps/api/test/migrations-apply-and-retry-db.test.ts and now rejected by
-- scripts/validate-migrations.mjs.

-- The inline CHECK from 0022 is auto-named there, but `user_packs` predates that migration in
-- Production, where the constraint may carry a different name. Dropping by discovered name rather
-- than by assumed name keeps this migration correct on both schemas.
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    FOR constraint_name IN
        SELECT conname
          FROM pg_constraint
         WHERE conrelid = 'user_packs'::regclass
           AND contype = 'c'
           AND pg_get_constraintdef(oid) ILIKE '%acquisition_type%'
    LOOP
        EXECUTE format('ALTER TABLE user_packs DROP CONSTRAINT %I', constraint_name);
    END LOOP;
END $$;

ALTER TABLE user_packs
  ADD CONSTRAINT user_packs_acquisition_type_check
  CHECK (acquisition_type IN ('free', 'purchased', 'support'));

ALTER TABLE user_packs
  DROP CONSTRAINT IF EXISTS user_packs_purchase_provenance_check;
ALTER TABLE user_packs
  ADD CONSTRAINT user_packs_purchase_provenance_check
  CHECK (purchase_event_id IS NULL OR acquisition_type = 'purchased');

COMMENT ON COLUMN user_packs.acquisition_type IS
  'How the entitlement was acquired: free (M2.3 self-service), purchased (M2.4 verified payment, '
  'with purchase_event_id), support (M3.2 manual Admin grant, never a payment).';

-- Least-privilege grants (LB-B30). Guarded on the role existing, so the migration is identical on
-- a developer database that has no roles and on a deployment that does.
--
-- DELETE on user_packs is what revoke uses: a support-issued entitlement is removed, not flagged,
-- because the canonical access rule reads row existence and a second "revoked" state would mean two
-- sources of truth for one decision. The audit trail keeps the history the row no longer holds.
--
-- purchase_events is SELECT only, and no grant here can change that: support must be able to SEE
-- that an entitlement came from a verified payment in order to refuse to revoke it, and must never
-- be able to alter the payment record itself.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'learnbox_admin') THEN
        GRANT SELECT, INSERT, DELETE ON user_packs TO learnbox_admin;
        GRANT SELECT ON packs TO learnbox_admin;
        GRANT SELECT ON purchase_events TO learnbox_admin;
    END IF;
END $$;

