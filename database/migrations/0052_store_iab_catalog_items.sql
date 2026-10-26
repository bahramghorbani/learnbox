-- Provider-store catalog mapping (M2-Myket catalog sync).
--
-- `packs` remains the single canonical catalog. This table does NOT copy pack title, content, or
-- price; it records only the provider-owned SKU that represents a canonical pack and the last
-- canonical price successfully sent to that provider. A provider SKU must never be inferred from
-- client input during receipt verification.
CREATE TABLE store_iab_catalog_items (
  provider billing_provider NOT NULL CHECK (provider IN ('myket', 'cafe_bazaar')),
  pack_id TEXT NOT NULL REFERENCES packs(id) ON DELETE RESTRICT,
  sku_id TEXT NOT NULL CHECK (sku_id ~ '^[A-Z0-9_]{3,100}$'),
  synced_price_tomans INTEGER NOT NULL CHECK (synced_price_tomans > 0),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, pack_id),
  UNIQUE (provider, sku_id)
);

CREATE INDEX store_iab_catalog_items_provider_sku_idx
  ON store_iab_catalog_items (provider, sku_id);
