# Database

PostgreSQL migrations are append-only. Review events are idempotent through `client_event_id`, which protects offline sync from duplicates.

`card_schedules` is the current, mutable scheduling projection for a user and a card. It can be rebuilt from the append-only review history when the scheduling policy changes or an incident requires reconciliation.
