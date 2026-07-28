# Data model draft

Core entities: User, DeviceSession, OTPChallenge, Card, CardVersion, Pack, ReviewEvent, CardSchedule, PersonalCard, MediaAsset, Purchase, Entitlement, FeatureFlag, AuditLog, and ContentReport. Phone numbers are normalized E.164 and treated as sensitive. `ReviewEvent.client_event_id` enforces sync idempotency.

`OTPChallenge` stores an opaque challenge ID, a keyed phone hash, a keyed code hash, purpose,
expiry, resend cooldown, attempt count and one-time consumption timestamp. Raw phone numbers and
OTP values do not enter the challenge table. The current server-core policy uses a five-digit code,
five-minute expiry, one-minute resend cooldown and five verification attempts; its database
migration and unit-tested transition contract are present, but no route or SMS delivery is active.

`ReviewEvent` is append-only; `CardSchedule` is a mutable projection keyed by `(user_id, card_id)`. The server applies one idempotent event at a time and updates the projection in the same transaction. A due-card query uses the user-scoped `due_at` index and excludes suspended and archived states.

`CardVersion` stores immutable versioned editorial content. `AdminRoleAssignment` gives a user the limited `content_reviewer`, `content_publisher`, or `super_admin` role. `ContentReviewDecision` is append-only and carries an idempotency key; `AuditLog` records each sensitive decision. Reviewer approval changes content to `approved`, never directly to `published`; a separate publisher role is required for release.

`ContentReviewCheck` records six independently auditable gates for each card version: German
linguistic review, Persian translation, provenance, visual QA, audio QA and app-flow validation.
Each starts `pending`; a named reviewer and timestamp are required to mark it `passed` or
`failed`. Rejection is a durable status and never deletes the reviewed record.

Product tiers use stable identifiers `learnbox_start` and `learnbox_plus`; subscription periods
use `monthly`, `three_month` and `annual`. The `entitlement_tiers` catalog represents both tiers;
`billing_products.tier_id` maps provider-neutral paid products to a tier after verification.
Remote configuration supplies display labels, limits, offers and eligibility versions. A future
configuration audit table must preserve the configuration version that informed a paywall or limit
decision without storing sensitive learner content.

`LaunchExperience` stores a versioned launch-screen or install-icon candidate with a checksum,
dimensions, optional crop focal point, UTC schedule and immutable fallback selection. It follows
the same reviewer/publisher separation as content: a future server transaction records the audit
event and activates only an approved or scheduled candidate. An installed launcher icon is still
release-packaged; the model schedules the candidate for that release instead of promising a remote
home-screen icon change.
