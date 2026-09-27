CREATE TYPE billing_provider AS ENUM ('cafe_bazaar', 'direct_web', 'google_play', 'app_store');
CREATE TYPE billing_environment AS ENUM ('sandbox', 'production');
CREATE TYPE purchase_status AS ENUM ('verified', 'revoked', 'refunded', 'rejected');

CREATE TABLE billing_products (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('subscription', 'one_time_pack')),
  entitlement_keys TEXT[] NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE purchase_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  provider billing_provider NOT NULL,
  environment billing_environment NOT NULL,
  provider_purchase_id TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES billing_products(id),
  status purchase_status NOT NULL,
  expires_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_purchase_id)
);

CREATE INDEX purchase_events_user_idx ON purchase_events (user_id, created_at DESC);
