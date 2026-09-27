# Database

PostgreSQL migrations are append-only. Review events are idempotent through `client_event_id`, which protects offline sync from duplicates.

`card_schedules` is the current, mutable scheduling projection for a user and a card. It can be rebuilt from the append-only review history when the scheduling policy changes or an incident requires reconciliation.

## Pack membership reconciliation (candidate; not applied to Production)

`0018_pack_membership_schema.sql` records the existing production `packs`/`pack_cards` schema which was created outside the tracked `0001`–`0017` migration ledger. The 17 existing production checksums match this repository. `pack_cards` is the actual live association of the 35 published starter cards to the published free starter pack, not a speculative new model. See `docs/release/CURRENT_RELEASE_BASELINE.md` for read-only findings. The migration creates empty pack tables on a fresh database and validates compatible existing tables without seeding or changing any row. An isolated fresh PostgreSQL 16 instance applied all 18 migrations and re-ran with zero changes.

Before any separately approved production application, take and test a backup, compare the live schema/constraints and ledger again, rehearse on a safe staging copy, and prove an application rollout can be reversed without deleting learner schedules, reviews, membership or content. A migration-ledger insert cannot be reversed by dropping tables that predated the migration. Never run this migration against Production as part of a general build or startup script before the owner gate.
