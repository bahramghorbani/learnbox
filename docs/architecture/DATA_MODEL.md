# Data model draft

Core entities: User, DeviceSession, OTPChallenge, Card, CardVersion, Pack, ReviewEvent, CardSchedule, PersonalCard, MediaAsset, Purchase, Entitlement, FeatureFlag, AuditLog, and ContentReport. Phone numbers are normalized E.164 and treated as sensitive. `ReviewEvent.client_event_id` enforces sync idempotency.

`ReviewEvent` is append-only; `CardSchedule` is a mutable projection keyed by `(user_id, card_id)`. The server applies one idempotent event at a time and updates the projection in the same transaction. A due-card query uses the user-scoped `due_at` index and excludes suspended and archived states.
