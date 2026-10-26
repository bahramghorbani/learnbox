-- M2-Myket: a learner can now pay through the Myket Android build's own in-app billing,
-- same as the existing android_bazaar channel. ios_sibapp is deliberately not added yet —
-- no iOS app exists to emit it (add it when that build ships, not speculatively now).
ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_channel_check;
ALTER TABLE purchase_orders
  ADD CONSTRAINT purchase_orders_channel_check
  CHECK (channel IN ('web_zarinpal', 'android_bazaar', 'android_myket'));
