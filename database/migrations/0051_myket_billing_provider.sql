-- M2-Myket: purchase_events needs its own `billing_provider` identity for Myket IAB receipts,
-- same reasoning as 0027's `ALTER TYPE billing_provider ADD VALUE 'zarinpal'` — a receipt's
-- provider says exactly which gateway/store holds it, never overloaded onto a sibling value.
-- `cafe_bazaar` already exists (0004); this is the Myket counterpart for the channel 0050 added.
ALTER TYPE billing_provider ADD VALUE IF NOT EXISTS 'myket';
