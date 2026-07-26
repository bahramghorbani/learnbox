# Data model draft

Core entities: User, DeviceSession, OTPChallenge, Card, CardVersion, Pack, ReviewEvent, CardSchedule, PersonalCard, MediaAsset, Purchase, Entitlement, FeatureFlag, AuditLog, and ContentReport. Phone numbers are normalized E.164 and treated as sensitive. `ReviewEvent.client_event_id` enforces sync idempotency.

`ReviewEvent` is append-only; `CardSchedule` is a mutable projection keyed by `(user_id, card_id)`. The server applies one idempotent event at a time and updates the projection in the same transaction. A due-card query uses the user-scoped `due_at` index and excludes suspended and archived states.

`CardVersion` stores immutable versioned editorial content. `AdminRoleAssignment` gives a user the limited `content_reviewer`, `content_publisher`, or `super_admin` role. `ContentReviewDecision` is append-only and carries an idempotency key; `AuditLog` records each sensitive decision. Reviewer approval changes content to `approved`, never directly to `published`; a separate publisher role is required for release.
