-- Provider-store catalog mapping (M2-Myket catalog sync).
--
-- `packs` remains the single canonical catalog. This table does NOT copy pack title, content, or
-- `learnbox_app` verifies receipts by resolving a SKU, and `learnbox_admin` writes the mapping
-- after a successful provider-side create/update. `learnbox_migrator` inherits SELECT on new tables
-- through the 0032 default-privilege repair, so no explicit backup-role grant is needed here.
-- grants: explicit app/admin verbs below; backup SELECT is default privileges from 0032.
CREATE TABLE IF NOT EXISTS store_iab_catalog_items (
  provider billing_provider NOT NULL CHECK (provider IN ('myket', 'cafe_bazaar')),
  pack_id TEXT NOT NULL REFERENCES packs(id) ON DELETE RESTRICT,
  sku_id TEXT NOT NULL CHECK (sku_id ~ '^[A-Z0-9_]{3,100}$'),
  synced_price_tomans INTEGER NOT NULL CHECK (synced_price_tomans > 0),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, pack_id),
  UNIQUE (provider, sku_id)
);

CREATE INDEX IF NOT EXISTS store_iab_catalog_items_provider_sku_idx
  ON store_iab_catalog_items (provider, sku_id);

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_app') THEN
    GRANT SELECT ON store_iab_catalog_items TO learnbox_app;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'learnbox_admin') THEN
    GRANT SELECT, INSERT, UPDATE ON store_iab_catalog_items TO learnbox_admin;
  END IF;
END $$;
