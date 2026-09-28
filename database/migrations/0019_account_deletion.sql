-- 0019: account deletion, deletion audit, and durable purchase-ownership evidence (LB-B04).
--
-- Forward-only. Creates new tables and relaxes nothing; no data is dropped, truncated or reset.
--
-- Design rationale
-- ----------------
-- Account deletion must remove ordinary live learner data while leaving two narrow, justified
-- traces behind:
--
--   1. account_deletion_events — a privacy-minimised audit record proving a deletion happened, so a
--      later support, fraud or restoration dispute can be investigated. It deliberately holds NO
--      shadow copy of the account: no phone number, no name, no learning content, no review
--      history, no sessions, no OTP material, no secrets. The learner is referenced only by
--      `subject_hash`, the existing HMAC-SHA256 phone hash already used for OTP challenges, which
--      is not reversible without the server secret.
--
--   2. purchase_ownership_claims — minimal durable evidence that a verified purchase was made, so a
--      legitimately purchased pack can be reclaimed after an account is deleted and recreated.
--      This table intentionally does NOT reference users(id): that is exactly what lets it survive
--      account deletion. It records only the stable external transaction identity plus the
--      entitlement it conveys.
--
-- This is NOT an implementation of LB-B17. No payment flow, price, receipt validation or
-- entitlement granting engine is added here. The table is the evidence substrate a future payment
-- system would attach to, so that deleting an account today cannot make tomorrow's restore
-- impossible.

CREATE TYPE account_deletion_status AS ENUM ('completed', 'failed');
CREATE TYPE account_deletion_actor AS ENUM ('learner', 'owner_support');

CREATE TABLE account_deletion_events (
  -- Internal, non-guessable deletion identifier. Safe to quote to a learner in support.
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Privacy-preserving reference to the deleted account. HMAC-SHA256 of the E.164 phone under
  -- LEARNBOX_OTP_SECRET — the same construction as otp_challenges.phone_hash. Not reversible
  -- without the secret, but stable enough to correlate a later dispute from the same phone.
  subject_hash TEXT NOT NULL,

  -- Opaque prior account reference, retained so support can correlate this deletion with earlier
  -- operational records without resurrecting the account itself.
  prior_user_id UUID NOT NULL,

  requested_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status account_deletion_status NOT NULL,
  actor account_deletion_actor NOT NULL,

  -- Idempotency key supplied by the client. A retry after a dropped connection must return the
  -- ORIGINAL deletion result rather than erroring or attempting a second pass, so the learner sees
  -- one truthful outcome. Unique per deletion event.
  request_id TEXT NOT NULL,

  -- Which written policy the deletion was executed under, so retention semantics stay auditable
  -- when the policy later changes.
  policy_version TEXT NOT NULL,

  -- Disposition counters. Counts only — never the deleted content itself.
  review_events_removed INTEGER NOT NULL DEFAULT 0,
  schedules_removed INTEGER NOT NULL DEFAULT 0,
  sessions_removed INTEGER NOT NULL DEFAULT 0,
  purchases_preserved INTEGER NOT NULL DEFAULT 0
);

-- Supports "has this phone been deleted before?" during a support or restoration dispute.
CREATE INDEX account_deletion_events_subject_idx
  ON account_deletion_events (subject_hash, completed_at DESC);

-- Enforces idempotency: the same client request can only ever produce one deletion event.
CREATE UNIQUE INDEX account_deletion_events_request_idx
  ON account_deletion_events (request_id);

CREATE TABLE purchase_ownership_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Stable external purchase identity. Together these uniquely identify a real store transaction
  -- and are what a future restore flow verifies against the provider.
  provider billing_provider NOT NULL,
  provider_purchase_id TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES billing_products(id),

  -- Who may reclaim it: the same privacy-preserving phone reference used above. A recreated
  -- account proving control of the same phone number resolves to the same subject_hash.
  subject_hash TEXT NOT NULL,

  -- Snapshot of the entitlement the purchase conveyed, so restoration does not depend on
  -- reconstructing historical product configuration.
  entitlement_keys TEXT[] NOT NULL,

  status purchase_status NOT NULL,
  purchased_at TIMESTAMPTZ,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Set when the evidence was preserved through an account deletion.
  preserved_by_deletion_id UUID REFERENCES account_deletion_events(id),

  -- Replay/duplicate prevention: one claim per real store transaction.
  UNIQUE (provider, provider_purchase_id)
);

CREATE INDEX purchase_ownership_claims_subject_idx
  ON purchase_ownership_claims (subject_hash, recorded_at DESC);
