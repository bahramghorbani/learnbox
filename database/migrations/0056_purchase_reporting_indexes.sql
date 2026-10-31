-- BZ-1: platform reporting filters use canonical provider/channel columns that already exist.
-- This is additive only; it changes neither ledger data nor payment behavior.
CREATE INDEX IF NOT EXISTS purchase_events_provider_created_at_idx
  ON purchase_events (provider, created_at DESC);

CREATE INDEX IF NOT EXISTS purchase_orders_channel_created_at_idx
  ON purchase_orders (channel, created_at DESC);
