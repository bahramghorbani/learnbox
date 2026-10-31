-- Cafe Bazaar product ids are lowercase with dots (e.g. learnbox.<pack>.<hash>), which the 0052
-- Myket-shaped SKU check rejects. Make the format check provider-specific; Myket is unchanged.
-- Constraint-only: no data rewrite, every existing row (myket) still satisfies the new check.
ALTER TABLE store_iab_catalog_items DROP CONSTRAINT IF EXISTS store_iab_catalog_items_sku_id_check;
ALTER TABLE store_iab_catalog_items DROP CONSTRAINT IF EXISTS store_iab_catalog_items_sku_format;
ALTER TABLE store_iab_catalog_items ADD CONSTRAINT store_iab_catalog_items_sku_format CHECK (
  (provider = 'myket' AND sku_id ~ '^[A-Z0-9_]{3,100}$')
  OR (provider = 'cafe_bazaar' AND sku_id ~ '^[a-z0-9_.]{3,100}$')
);
