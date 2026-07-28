# Offline sync

Clients persist review events locally, retry with backoff, show sync state, and retain events until acknowledged. Server de-duplicates by client event ID, reconciles schedules server-side, and guards against clock skew.

The shared queue orders due retries deterministically, uses bounded exponential backoff, and only removes an event whose exact client event ID has been acknowledged.

## Device persistence

The shared storage adapter serializes retry timestamps as ISO strings and restores them only when the complete saved structure is valid. A corrupt or incompatible queue is deleted and fails closed to an empty queue; no partial event set and no malformed event can reach the server. An empty queue removes its device-storage key. The web client will supply `localStorage` only after the learner has signed in, while mobile will provide its encrypted device-store implementation behind the same small interface.

The current web prototype records each card grade as a client event in that local queue and transparently reports how many answers are safely waiting. It also keeps valid learner-added vocabulary on the same device through a versioned local collection; each new addition receives an idempotent device-sync event, while malformed local records are ignored and duplicate German prompts are refused. The current UI reports the number of local vocabulary additions ready for future sync, but intentionally does not attempt delivery until authenticated server sign-in is activated; the existing phone screen is a local UI prototype, not a real identity provider.

The learner's completed onboarding goal is also a device-only preference in the prototype, so returning to the same browser does not show the setup screen again. It is not treated as an authenticated account profile and is never sent anywhere; a real sign-in integration will replace this with server-owned learner preferences.

The web client wraps browser storage with an in-memory fallback. If a browser denies access to durable storage, the learner can still complete onboarding, review cards and add a word during the open app session; no exception can block the flow and nothing is sent externally. Durable storage remains preferred, and the temporary fallback naturally disappears when the app is closed. This has no analytics intent and can be rolled back by removing the wrapper while leaving the versioned storage schemas unchanged.

An interrupted daily review stores only the index of its next card in a versioned device key. On return, the primary action becomes `ادامهٔ مرور` and resumes that card; a completed session or malformed/out-of-range index is cleared. The individual review grades remain in the existing idempotent queue, so resuming never duplicates an already-recorded answer. This is device-only, emits no analytics and can be rolled back by clearing the review-session key.

Acceptance criteria: a queued review survives an app restart; an acknowledgement is persisted before the next retry; malformed local data does not crash the learner flow or create a server request. This is a local reliability improvement with no learner analytics emitted. It can be rolled back by disabling the client-side queue integration while the server-side idempotency boundary remains intact.
