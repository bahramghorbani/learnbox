-- 0021_learner_profile_fields.sql
--
-- LB-B28a: optional learner profile fields.
--
-- Adds four NULLABLE columns to users. Phone stays the account/auth identity; none of these
-- fields is an identity or login key, and none is required by any learning flow, so a NULL
-- here always means "the learner has not provided it".
--
-- Date of birth is stored as a date, never as a calculated age. Gender keeps an explicit
-- 'prefer_not_to_say' value that is distinct from NULL (NULL = never answered).
--
-- Forward-only and additive: ADD COLUMN IF NOT EXISTS with no default, so no existing row is
-- rewritten and no existing data is altered or moved. Account deletion already removes the
-- whole users row (account-deletion-store.ts), so these columns are deleted with it.
--
-- New personal data: the public privacy notice is updated in the same change.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_name text
        CHECK (last_name IS NULL OR char_length(last_name) BETWEEN 1 AND 50),
    ADD COLUMN IF NOT EXISTS date_of_birth date
        CHECK (date_of_birth IS NULL OR date_of_birth >= DATE '1900-01-01'),
    ADD COLUMN IF NOT EXISTS gender text
        CHECK (gender IS NULL OR gender IN ('female', 'male', 'other', 'prefer_not_to_say')),
    -- The avatar allowlist lives in application code so adding an avatar needs no migration;
    -- the database only enforces the identifier shape.
    ADD COLUMN IF NOT EXISTS avatar_id text
        CHECK (avatar_id IS NULL OR avatar_id ~ '^[a-z0-9-]{1,40}$');
