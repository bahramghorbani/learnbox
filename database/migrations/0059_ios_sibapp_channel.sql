-- iOS Sibapp channel: purchase_orders gets 'ios_sibapp' (0050 deliberately deferred it until an iOS
-- build existed — apps/ios now does), and the store catalog accepts provider 'sibapp' whose SKU is
-- the Sibapp package id. Constraint-only: every existing row still satisfies the new checks.
ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_channel_check;
ALTER TABLE purchase_orders
  ADD CONSTRAINT purchase_orders_channel_check
  CHECK (channel IN ('web_zarinpal', 'android_bazaar', 'android_myket', 'ios_sibapp'));

ALTER TABLE store_iab_catalog_items DROP CONSTRAINT IF EXISTS store_iab_catalog_items_provider_check;
ALTER TABLE store_iab_catalog_items
  ADD CONSTRAINT store_iab_catalog_items_provider_check
  CHECK (provider IN ('myket', 'cafe_bazaar', 'sibapp'));

ALTER TABLE store_iab_catalog_items DROP CONSTRAINT IF EXISTS store_iab_catalog_items_sku_format;
ALTER TABLE store_iab_catalog_items ADD CONSTRAINT store_iab_catalog_items_sku_format CHECK (
  (provider = 'myket' AND sku_id ~ '^[A-Z0-9_]{3,100}$')
  OR (provider = 'cafe_bazaar' AND sku_id ~ '^[a-z0-9_.]{3,100}$')
  OR (provider = 'sibapp' AND sku_id ~ '^[A-Za-z0-9_-]{3,64}$')
);
