-- 0026_store_listings.sql
--
-- Phase 2 / Milestone 2.1: the canonical commercial listing layer.
--
-- One table, keyed 1:1 on the canonical pack. It exists because commercial availability is a
-- DIFFERENT fact from content publication: an operator must be able to publish content without
-- offering it for sale, and withdraw an offer without unpublishing content. `packs.status` cannot
-- carry both meanings.
--
-- What this table deliberately does NOT own:
--
--   * price_tomans, category, is_free  — already canonical on `packs` and already authored in the
--     Phase 1 Content & Packs workspace. Duplicating them here would create a second source of
--     truth for commercial facts, so the Store reads them through the pack instead.
--   * anything about cards, card versions, media or learning content — the Store references the
--     canonical pack and never restates its contents.
--
-- `pack_id` is the PRIMARY KEY as well as the foreign key, which is what makes the 1:1 relationship
-- a database guarantee rather than a convention: a pack cannot carry two listings, and a listing
-- cannot exist without a pack. Deleting a pack removes its listing; the reverse is impossible.
--
-- Additive and non-destructive: creates one new table and one index, alters nothing, drops nothing,
-- backfills nothing. Every existing pack simply has no listing row, which reads as "not in the
-- Store" — the correct default for a commercial surface that nobody has configured yet.
--
-- This migration grants no learner-facing capability. Entitlement enforcement (M2.2), free
-- acquisition (M2.3) and payment (M2.4) are separate milestones; nothing here makes a pack
-- purchasable or changes who can read content.

CREATE TABLE store_listings (
  pack_id TEXT PRIMARY KEY REFERENCES packs(id) ON DELETE CASCADE,

  -- Commercial availability, independent of `packs.status`. 'unlisted' is the default so a new
  -- listing row is never silently for sale.
  store_status TEXT NOT NULL DEFAULT 'unlisted' CHECK (store_status IN ('unlisted', 'listed')),

  featured BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,

  -- Commercial presentation only. The cover is a storage object key, never a public URL, so the
  -- existing private-media authorization boundary keeps applying.
  cover_object_key TEXT,

  -- Commercial copy (store blurb). Distinct from `packs.description`, which is content metadata.
  commercial_summary TEXT,

  -- When the pack most recently became commercially available. Required whenever the listing is
  -- actually listed, so "for sale since" is always answerable without reading the audit log.
  listed_at TIMESTAMPTZ,

  CONSTRAINT store_listings_listed_at_present
    CHECK (store_status = 'unlisted' OR listed_at IS NOT NULL)
);

-- Serves the Admin listing table today and the learner catalogue ordering in M2.2 — featured first,
-- then operator display order, with the pack slug as a stable tiebreaker.
CREATE INDEX store_listings_display_idx
  ON store_listings (store_status, featured DESC, display_order, pack_id);
