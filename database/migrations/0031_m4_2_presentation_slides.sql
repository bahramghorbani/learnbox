-- M4.2 — Admin Slider Manager on the canonical `banners` table.
--
-- `banners` already carries everything a slide needs (title, description, link_type, link_url,
-- sort_order, is_active), so this migration adds no table and no second banner model. The one
-- genuinely missing piece is the image: a slide image must be owner-supplied bytes, not an external
-- URL a third party controls, and the existing `image_url` column cannot hold bytes.
--
-- `image_data BYTEA` mirrors the splash exactly (0022 added `splash_versions.image_data` for the
-- same reason, see apps/admin database-splash-storage): the bytes live in the canonical database,
-- so there is no new storage provider, no public object path and no second media system. The
-- learner banner route selects an explicit column list, so adding this column does not put bytes in
-- any learner response; delivery of slide images to the learner is M4.3.
--
-- `image_url` is left exactly as it is. The existing Production sample banners keep their current
-- values, keep `image_data` NULL, and are not read or written by this migration.
--
-- Grants mirror infrastructure/database/db-roles-p0.sql so an already-provisioned database gains
-- them too, guarded on role existence like 0028/0030 because local and CI databases have no
-- least-privilege roles. The Admin gets INSERT and UPDATE on `banners` and nothing else: the
-- Slider Manager creates, edits, activates, deactivates and reorders slides, and deliberately
-- cannot delete a row, so no DELETE privilege is granted.

ALTER TABLE banners ADD COLUMN IF NOT EXISTS image_data BYTEA;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'learnbox_admin') THEN
        GRANT INSERT, UPDATE ON banners TO learnbox_admin;
    END IF;
END $$;
