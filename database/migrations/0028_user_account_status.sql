-- 0028_user_account_status.sql
--
-- Phase 3 / M3.1: temporary account suspension.
--
-- Support needs a reversible answer to "this account must stop acting right now" that is NOT
-- deletion. Account deletion (0019) is permanent and erases the person; suspension keeps every row
-- — identity, learning progress, review history, Pack entitlements, purchase records — and only
-- withdraws the right to act. The two lifecycles stay separate: nothing here reads, writes or
-- cancels `account_deletion_events`.
--
-- One column, not a table. "Is this account allowed to act?" is a single current fact about the
-- user, so it belongs on the row the learner runtime already reads when it authenticates. The
-- history of who changed it, when and why is NOT duplicated here: it goes to the canonical
-- `audit_logs` (0003), which already carries actor, action, entity, metadata and timestamp for
-- every other Admin state change.
--
-- `status` rather than a boolean, matching `packs.status`, `card_versions.status`,
-- `payment_requests.status` and `purchase_events.status`: a named state reads the same way in SQL,
-- in a log line and in the Admin UI, and a third state (should one ever be justified) needs no
-- column rename.
--
-- Forward-only and additive. ADD COLUMN IF NOT EXISTS with a DEFAULT that every existing row
-- already satisfies, so no row is rewritten, no data is moved and no existing behaviour changes
-- until an operator suspends somebody. Rolling back is dropping the column.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Separate guarded block so re-running the migration cannot fail on an existing constraint
-- (same pattern as the 0023 timezone shape check).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_status_allowed'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_status_allowed
            CHECK (status IN ('active', 'disabled'));
    END IF;
END $$;

-- Least-privilege runtime grants (LB-B30 P0 role split), applied only where the role exists so a
-- database rebuilt from migrations alone (tests, local) is unaffected.
--
-- The Admin runtime gets UPDATE on exactly one column of `users` and nothing else: it can suspend
-- and restore an account, and it still cannot edit a phone number, a name or any other personal
-- field. It also needs the canonical session cutoff, because suspending an account that keeps a
-- valid 30-day session would be a UI-only suspension.
--
-- The learner runtime needs no new grant: it already holds SELECT on `users`, which is where the
-- single authentication check reads this column.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'learnbox_admin') THEN
        GRANT UPDATE (status) ON users TO learnbox_admin;
        -- INSERT .. ON CONFLICT DO UPDATE: the canonical "log out everywhere" cutoff (0020).
        GRANT INSERT, UPDATE ON user_session_cutoffs TO learnbox_admin;
        GRANT SELECT ON user_session_cutoffs TO learnbox_admin;
    END IF;
END $$;
