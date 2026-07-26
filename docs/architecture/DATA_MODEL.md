# Data model draft

Core entities: User, DeviceSession, OTPChallenge, Card, CardVersion, Pack, ReviewEvent, CardSchedule, PersonalCard, MediaAsset, Purchase, Entitlement, FeatureFlag, AuditLog, and ContentReport. Phone numbers are normalized E.164 and treated as sensitive. `ReviewEvent.client_event_id` enforces sync idempotency.
