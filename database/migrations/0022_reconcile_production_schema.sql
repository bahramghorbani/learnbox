-- 0022: reconcile schema that exists in Production but was never created by a repo migration.
--
-- A read-only comparison of Production (2026-09-29, 0018 in its ledger) against the migrations found
-- four tables and one column that live in Production and are used by the running code, yet appear in
-- no migration. A database rebuilt from the migrations alone therefore lacked them, and
-- account deletion (which clears user_packs and payment_logs) could not run on it.
--
-- Forward-only and idempotent. Every statement is IF NOT EXISTS, so:
--   * on Production (all objects already exist) this migration changes NOTHING;
--   * on a database rebuilt from migrations it creates the missing objects.
-- No DROP, TRUNCATE, DELETE, UPDATE or ALTER of an existing column. Definitions below are copied
-- from the Production catalog so a fresh database ends up structurally identical to Production.
--
-- Deliberately NOT reproduced: the redundant unique index splash_versions_object_key_idx that exists
-- in Production next to the UNIQUE constraint's own index. Recreating a duplicate index on fresh
-- databases would be waste, and dropping it in Production is a separate, unnecessary change.
--
-- Scope note: these tables exist only because earlier code paths use them. This migration adds no
-- payment behaviour; user_packs / payment_logs / payment_gateways are empty in Production.

CREATE TABLE IF NOT EXISTS payment_gateways (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  gateway_type TEXT NOT NULL CHECK (gateway_type IN ('zarinpal', 'irankish', 'usdt')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  pack_id TEXT NOT NULL REFERENCES packs(id),
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acquisition_type TEXT NOT NULL CHECK (acquisition_type IN ('free', 'purchased')),
  purchase_event_id UUID,
  UNIQUE (user_id, pack_id)
);
CREATE INDEX IF NOT EXISTS idx_user_packs_user ON user_packs (user_id);

CREATE TABLE IF NOT EXISTS payment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  pack_id TEXT NOT NULL REFERENCES packs(id),
  gateway_id TEXT REFERENCES payment_gateways(id),
  amount_tomans INTEGER,
  amount_usdt NUMERIC,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'expired')),
  provider_ref TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_payment_logs_created ON payment_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_logs_status ON payment_logs (status);
CREATE INDEX IF NOT EXISTS idx_payment_logs_user ON payment_logs (user_id);

CREATE TABLE IF NOT EXISTS banners (
  id TEXT PRIMARY KEY DEFAULT ('banner_' || substr(gen_random_uuid()::text, 1, 8)),
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  background_color TEXT DEFAULT '#1e293b',
  link_url TEXT,
  link_type TEXT DEFAULT 'url' CHECK (link_type IN ('url', 'pack', 'screen')),
  link_target TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Admin splash storage keeps the image bytes in the database (see apps/admin database-splash-storage).
ALTER TABLE splash_versions ADD COLUMN IF NOT EXISTS image_data BYTEA;
