-- 0020_session_revocation.sql
--
-- LB-B26: server-side session revocation.
--
-- The learner session cookie is a signed, stateless token. Clearing the cookie on
-- logout only asks the browser to forget it; a copy captured beforehand stays
-- cryptographically valid until it expires. With v1.2 raising session lifetime to
-- 30 days, that residual validity becomes the dominant risk, so revocation needs
-- server-side state.
--
-- Two revocation granularities, both needed:
--   * one row per revoked session id  -> "log out this device"
--   * one row per user with a cutoff  -> "log out everywhere" / forced invalidation
--
-- Forward-only. Creates a new table only; no existing table, column or row is
-- altered, and no data is moved or deleted.

CREATE TABLE IF NOT EXISTS revoked_sessions (
    session_id  text PRIMARY KEY,
    user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    revoked_at  timestamptz NOT NULL DEFAULT now(),
    -- Rows may be pruned once the underlying token can no longer be valid.
    expires_at  timestamptz NOT NULL
);

-- Revocation is read on every authenticated request, keyed by session id (the
-- primary key). This index serves pruning and per-user revocation listing.
CREATE INDEX IF NOT EXISTS revoked_sessions_user_idx ON revoked_sessions (user_id);
CREATE INDEX IF NOT EXISTS revoked_sessions_expires_idx ON revoked_sessions (expires_at);

-- "Invalidate every session issued before this instant" for one user. Used by
-- log-out-everywhere and by any future forced invalidation (password/phone
-- change, abuse response). A single row per user, updated in place.
CREATE TABLE IF NOT EXISTS user_session_cutoffs (
    user_id        uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    sessions_valid_from timestamptz NOT NULL DEFAULT now()
);
