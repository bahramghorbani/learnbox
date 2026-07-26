# Offline sync

Clients persist review events locally, retry with backoff, show sync state, and retain events until acknowledged. Server de-duplicates by client event ID, reconciles schedules server-side, and guards against clock skew.
