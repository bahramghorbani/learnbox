-- 0027_zarinpal_paid_acquisition.sql
--
-- Phase 2 / Milestone 2.4: paid pack acquisition through Zarinpal (Web/PWA).
--
-- This EXTENDS the existing `purchase_events` table from 0004_billing_foundation rather than
-- adding a payment table of its own. A second transaction log would mean two places to look when a
-- learner says "I paid and got nothing", and two places for an entitlement to be granted from.
--
-- What 0004 already provides, and is reused unchanged:
--
--   * `id`                      — the internal LearnBox transaction identifier. Support and
--                                 reconciliation already have a canonical handle; no new id column.
--   * `provider`/`environment`  — provider identity and sandbox/production separation.
--   * `provider_purchase_id`    — the provider's handle for the attempt. For Zarinpal this is the
--                                 Authority returned by the payment request.
--   * `UNIQUE (provider, provider_purchase_id)` — the duplicate-payment guarantee. A replayed
--                                 callback cannot create a second transaction row for the same
--                                 Authority, because the database refuses it.
--   * `status`, `verified_at`, `created_at` — canonical payment state and audit timestamps.
--
-- What 0004 could NOT express, and why each column below is genuinely required:
--
--   * `pack_id` — 0004 models store billing, where a purchase points at a `billing_products` row
--     keyed to entitlement strings. A LearnBox pack purchase is for a canonical pack, and the
--     entitlement it grants is a `user_packs` row referencing `packs.id`. Without a direct pack
--     reference, granting an entitlement from a verified payment would require inventing a
--     `billing_products` row per pack — a second catalogue beside `packs`, which Phase 2
--     architecture forbids.
--
--   * `amount_tomans` — the immutable amount snapshot. Zarinpal verification MUST send the same
--     amount that was sent at request time, and an operator may change `packs.price_tomans` while
--     a learner sits on the gateway page. Re-reading the pack price at verification would make
--     verification fail (or, worse, succeed against a different amount) for a payment that was
--     already made correctly. The amount the learner was asked for is a historical fact and is
--     therefore stored, not recomputed.
--
--   * `provider_reference` — Zarinpal's RefID, issued only on successful verification. This is the
--     tracking code the learner sees on their bank statement and quotes to support; it is distinct
--     from the Authority, which exists from the moment the payment is requested and proves nothing.
--
--   * `updated_at` — a payment moves through states (pending → verified/failed/cancelled) and
--     support needs to know when it last moved. `created_at` and `verified_at` alone cannot date a
--     failure or a cancellation.
--
-- No currency column: Zarinpal settles in Iranian Rial only and LearnBox prices packs in Tomans.
-- The unit lives in the column name, as it already does on `packs.price_tomans`. A currency column
-- with exactly one possible value is a field that can only ever be wrong.
--
-- `product_id` loses its NOT NULL. It stays for the Bazaar/store-billing model (Android, a later
-- phase) and is simply absent on a pack purchase. The CHECK below makes the two shapes mutually
-- exclusive and each one internally complete, so neither can be half-populated.
--
-- Additive and non-destructive: adds enum values, adds nullable columns, relaxes one NOT NULL,
-- adds one CHECK constraint and one index. Drops nothing, rewrites nothing, backfills nothing.
-- Existing rows (Production has zero) remain valid as `product_id`-shaped purchases.
--
-- This migration grants no learner-facing capability and no entitlement. It does not make any pack
-- purchasable: pricing, listing and publication remain owner-controlled, and the paid flow stays
-- behind its own configuration gate. Phase 2 payment is Zarinpal/Web only — nothing here is
-- specific to Cafe Bazaar or Android, which belong to a later phase.

-- Zarinpal is its own provider identity. `direct_web` is deliberately NOT overloaded: reconciling
-- or refunding a payment requires knowing which gateway holds it.
ALTER TYPE billing_provider ADD VALUE IF NOT EXISTS 'zarinpal';

-- 0004's statuses describe only settled outcomes ('verified', 'revoked', 'refunded', 'rejected'),
-- which is enough for a store receipt that arrives already-final. A gateway redirect flow also has
-- states that are genuinely in flight or genuinely abandoned, and conflating them loses the one
-- distinction operations depends on: "we do not yet know" must never read as "it failed".
ALTER TYPE purchase_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE purchase_status ADD VALUE IF NOT EXISTS 'failed';
ALTER TYPE purchase_status ADD VALUE IF NOT EXISTS 'cancelled';

ALTER TABLE purchase_events
  ADD COLUMN IF NOT EXISTS pack_id TEXT REFERENCES packs (id),
  ADD COLUMN IF NOT EXISTS amount_tomans INTEGER,
  ADD COLUMN IF NOT EXISTS provider_reference TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE purchase_events ALTER COLUMN product_id DROP NOT NULL;

-- Exactly one of the two purchase shapes, each complete:
--   * pack purchase  — a canonical pack and a positive amount snapshot, no billing product;
--   * store purchase — a billing product, as 0004 defined it.
-- This is what stops a pack purchase existing without the amount its verification depends on.
ALTER TABLE purchase_events
  DROP CONSTRAINT IF EXISTS purchase_events_subject_shape;
ALTER TABLE purchase_events
  ADD CONSTRAINT purchase_events_subject_shape CHECK (
    (
      pack_id IS NOT NULL
      AND amount_tomans IS NOT NULL
      AND amount_tomans > 0
      AND product_id IS NULL
    )
    OR (
      product_id IS NOT NULL
      AND pack_id IS NULL
      AND amount_tomans IS NULL
    )
  );

-- Admin's transaction view and support lookups read newest-first for one pack.
CREATE INDEX IF NOT EXISTS purchase_events_pack_idx
  ON purchase_events (pack_id, created_at DESC);
