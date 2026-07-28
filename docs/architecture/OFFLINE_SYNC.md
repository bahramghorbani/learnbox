# Offline sync

Clients persist review events locally, retry with backoff, show sync state, and retain events until acknowledged. Server de-duplicates by client event ID, reconciles schedules server-side, and guards against clock skew.

The shared queue orders due retries deterministically, uses bounded exponential backoff, and only removes an event whose exact client event ID has been acknowledged.

## Device persistence

The shared storage adapter serializes retry timestamps as ISO strings and restores them only when the complete saved structure is valid. A corrupt or incompatible queue is deleted and fails closed to an empty queue; no partial event set and no malformed event can reach the server. An empty queue removes its device-storage key. The web client will supply `localStorage` only after the learner has signed in, while mobile will provide its encrypted device-store implementation behind the same small interface.

The current web prototype records each card grade as a client event in that local queue and transparently reports how many answers are safely waiting. It also keeps valid learner-added vocabulary on the same device through a versioned local collection; each new addition receives an idempotent device-sync event, while malformed local records are ignored and duplicate German prompts are refused. The current UI reports the number of local vocabulary additions ready for future sync, but intentionally does not attempt delivery until authenticated server sign-in is activated; the existing phone screen is a local UI prototype, not a real identity provider.

The learner's completed onboarding goal is also a device-only preference in the prototype, so returning to the same browser does not show the setup screen again. It is not treated as an authenticated account profile and is never sent anywhere; a real sign-in integration will replace this with server-owned learner preferences.

Acceptance criteria: a queued review survives an app restart; an acknowledgement is persisted before the next retry; malformed local data does not crash the learner flow or create a server request. This is a local reliability improvement with no learner analytics emitted. It can be rolled back by disabling the client-side queue integration while the server-side idempotency boundary remains intact.
