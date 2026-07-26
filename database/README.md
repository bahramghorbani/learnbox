# Database

PostgreSQL migrations are append-only. Review events are idempotent through `client_event_id`, which protects offline sync from duplicates.
