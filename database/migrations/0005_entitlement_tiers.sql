CREATE TABLE entitlement_tiers (
  id TEXT PRIMARY KEY CHECK (id IN ('learnbox_start', 'learnbox_plus')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO entitlement_tiers (id) VALUES ('learnbox_start'), ('learnbox_plus');

ALTER TABLE billing_products
  ADD COLUMN tier_id TEXT REFERENCES entitlement_tiers(id);

CREATE INDEX billing_products_tier_idx ON billing_products (tier_id) WHERE active;
