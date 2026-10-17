-- Commerce core v1 (contract docs/architecture/COMMERCE_CORE_CONTRACT.md, PR #436).
--
-- Additive only. No existing purchase, entitlement or legacy row is removed; payment_logs and
-- payment_gateways are only marked deprecated. Re-runnable: IF NOT EXISTS, DROP/ADD CONSTRAINT,
-- idempotent backfill and GRANTs.
--
-- 1. purchase_orders: one learner intent to buy one pack, with an immutable price/name snapshot.
--    At most one OPEN order per learner and pack (partial unique index) — the lock that makes
--    concurrent and repeated checkouts converge on one order.
-- 2. purchase_events becomes the payment ATTEMPT: order link, the exact provider amount and
--    currency sent (IRR, = tomans x 10, enforced), last provider check, and a review flag for
--    a valid payment that could not create a new entitlement.
-- 3. purchase_order_events: append-only timeline, also carrying Admin re-check requests.
-- 4. purchase_ownership_claims becomes pack-aware with a bounded retention date.

CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Opaque support code; 10 hex characters from a random UUID, collisions refused by UNIQUE.
  public_code TEXT NOT NULL UNIQUE
    DEFAULT ('LB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  user_id UUID NOT NULL REFERENCES users (id),
  pack_id TEXT NOT NULL REFERENCES packs (id),
  channel TEXT NOT NULL DEFAULT 'web_zarinpal'
    CHECK (channel IN ('web_zarinpal', 'android_bazaar')),
  environment billing_environment NOT NULL,
  amount_tomans INTEGER NOT NULL CHECK (amount_tomans > 0),
  pack_display_name TEXT NOT NULL,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'fulfilled', 'needs_review', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_one_open_idx
  ON purchase_orders (user_id, pack_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS purchase_orders_user_idx ON purchase_orders (user_id, created_at DESC);

ALTER TABLE purchase_events
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES purchase_orders (id),
  ADD COLUMN IF NOT EXISTS provider_amount BIGINT,
  ADD COLUMN IF NOT EXISTS provider_currency TEXT,
  ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS check_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_provider_code INTEGER,
  ADD COLUMN IF NOT EXISTS review_reason TEXT;

ALTER TABLE purchase_events DROP CONSTRAINT IF EXISTS purchase_events_provider_amount_check;
ALTER TABLE purchase_events
  ADD CONSTRAINT purchase_events_provider_amount_check CHECK (
    (provider_amount IS NULL AND provider_currency IS NULL)
    OR (provider_currency = 'IRR' AND provider_amount = amount_tomans::bigint * 10)
  );
ALTER TABLE purchase_events DROP CONSTRAINT IF EXISTS purchase_events_review_reason_check;
ALTER TABLE purchase_events
  ADD CONSTRAINT purchase_events_review_reason_check
  CHECK (review_reason IS NULL OR review_reason IN ('already_entitled', 'provider_mismatch', 'provider_rejected'));

CREATE INDEX IF NOT EXISTS purchase_events_order_idx ON purchase_events (order_id);
CREATE INDEX IF NOT EXISTS purchase_events_open_idx
  ON purchase_events (created_at) WHERE status IN ('pending', 'cancelled');
CREATE INDEX IF NOT EXISTS purchase_events_reference_idx ON purchase_events (provider_reference);

CREATE TABLE IF NOT EXISTS purchase_order_events (
  id BIGSERIAL PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES purchase_orders (id),
  attempt_id UUID REFERENCES purchase_events (id),
  kind TEXT NOT NULL CHECK (kind IN (
    'order_opened', 'order_expired', 'attempt_created', 'attempt_reused', 'verified',
    'already_entitled', 'provider_mismatch', 'provider_rejected', 'cancelled', 'failed', 'check_unresolved',
    'recheck_requested'
  )),
  source TEXT NOT NULL CHECK (source IN (
    'learner_initiate', 'provider_callback', 'learner_status', 'reconciliation', 'admin_recheck'
  )),
  provider_code INTEGER,
  actor_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchase_order_events_order_idx
  ON purchase_order_events (order_id, id);

-- Backfill: one order per pre-existing pack attempt (expected none: payment was never enabled).
INSERT INTO purchase_orders
  (user_id, pack_id, environment, amount_tomans, pack_display_name, snapshot, status, created_at)
SELECT pe.user_id, pe.pack_id, pe.environment, pe.amount_tomans,
       COALESCE(p.display_name, pe.pack_id),
       jsonb_build_object('backfilled', true, 'attempt_id', pe.id),
       CASE WHEN pe.status = 'verified' THEN 'fulfilled' ELSE 'expired' END,
       pe.created_at
  FROM purchase_events pe
  LEFT JOIN packs p ON p.id = pe.pack_id
 WHERE pe.pack_id IS NOT NULL AND pe.order_id IS NULL;
UPDATE purchase_events pe
   SET order_id = po.id,
       provider_amount = pe.amount_tomans::bigint * 10,
       provider_currency = 'IRR'
  FROM purchase_orders po
 WHERE pe.order_id IS NULL AND po.snapshot->>'attempt_id' = pe.id::text;

-- Deletion evidence, pack-aware and minimal (no user id, phone, name, card data or snapshot).
ALTER TABLE purchase_ownership_claims ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE purchase_ownership_claims
  ADD COLUMN IF NOT EXISTS pack_id TEXT,
  ADD COLUMN IF NOT EXISTS amount_tomans INTEGER,
  ADD COLUMN IF NOT EXISTS provider_reference TEXT,
  ADD COLUMN IF NOT EXISTS retain_until TIMESTAMPTZ;
ALTER TABLE purchase_ownership_claims DROP CONSTRAINT IF EXISTS purchase_ownership_claims_subject_shape;
ALTER TABLE purchase_ownership_claims
  ADD CONSTRAINT purchase_ownership_claims_subject_shape CHECK (
    (product_id IS NOT NULL AND pack_id IS NULL)
    OR (product_id IS NULL AND pack_id IS NOT NULL AND amount_tomans > 0 AND retain_until IS NOT NULL)
  );

COMMENT ON TABLE payment_logs IS
  'DEPRECATED (commerce contract v1): frozen, no writer. Kept until a separate removal change.';
COMMENT ON TABLE payment_gateways IS
  'DEPRECATED (commerce contract v1): frozen; provider activation is a runtime flag.';

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON purchase_orders TO learnbox_app;
    GRANT SELECT, INSERT, DELETE ON purchase_order_events TO learnbox_app;
    GRANT USAGE ON SEQUENCE purchase_order_events_id_seq TO learnbox_app;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_admin') THEN
    GRANT SELECT ON purchase_orders, purchase_order_events TO learnbox_admin;
    GRANT INSERT ON purchase_order_events TO learnbox_admin;
    GRANT USAGE ON SEQUENCE purchase_order_events_id_seq TO learnbox_admin;
  END IF;
END $$;
