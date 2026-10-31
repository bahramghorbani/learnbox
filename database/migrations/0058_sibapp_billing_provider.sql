-- Sibapp (iOS) in-app purchases get their own billing_provider identity, same as 0051 did for
-- Myket. Alone in its migration: a new enum value cannot be used in the transaction that adds it,
-- and 0059's constraints reference it.
ALTER TYPE billing_provider ADD VALUE IF NOT EXISTS 'sibapp';
