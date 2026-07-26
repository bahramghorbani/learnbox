# Offline sync

Clients persist review events locally, retry with backoff, show sync state, and retain events until acknowledged. Server de-duplicates by client event ID, reconciles schedules server-side, and guards against clock skew.

The shared queue orders due retries deterministically, uses bounded exponential backoff, and only removes an event whose exact client event ID has been acknowledged.
