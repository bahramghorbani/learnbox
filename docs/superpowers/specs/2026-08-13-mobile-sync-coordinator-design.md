# Mobile Review Sync Coordinator Design

**Status:** Owner-approved design, ready for implementation planning  
**Storyboard:** 24 of 30 — Beta and load testing  
**Scope:** Native Flutter review-event synchronization boundary only

## Goal

Add the provider-neutral mobile coordination layer that can later upload securely stored review
events after authentication exists, without enabling authentication, networking, background work,
Preview, Production, or a real learner cohort in this change.

## Selected approach

Implement a small coordinator around the existing encrypted `ReviewQueue`. The coordinator depends
only on abstract identity and transport ports. Production composition continues to use disabled
implementations, so the application remains fully offline and performs no HTTP request.

This is preferred over connecting OTP and HTTP immediately because the repository does not yet have
a complete stable internal learner-identity mapping or an authenticated review HTTP route. It also
avoids creating a mobile-only identity protocol that would diverge from the existing web session and
server idempotency boundaries.

## Architecture

### Identity gate

`MobileIdentityState` reports either `signedOut` or an opaque `authenticated` state. The coordinator
never accepts a phone number, OTP, user ID, cookie, access token, refresh token, or provider value as
a method argument. A later authentication adapter owns credential storage and derives this state.

When signed out, a synchronization attempt returns `authenticationRequired` without reading or
mutating the review queue and without calling transport.

### Queue snapshot

Extend the existing long-lived `ReviewQueue` with a serialized `pendingEvents()` read. It returns an
immutable snapshot in persisted order. Queue reads and mutations continue through the same mutation
lane, so recording, snapshotting, and acknowledgement cannot race within the application process.

Malformed persisted data keeps the existing fail-closed local recovery behavior and never reaches
transport. This change does not alter the queue schema or encryption namespace.

### Transport contract

`ReviewSyncTransport.upload(events)` receives only a non-empty, bounded batch of typed pending
events. It returns the exact `clientEventId` values durably acknowledged by the server. The contract
does not expose endpoint URLs, headers, cookies, tokens, providers, or server user identifiers.

The coordinator rejects a transport response containing an unknown or duplicate acknowledgement.
It acknowledges no local event in that case and reports a retryable failure. Partial valid
acknowledgement is supported only when the complete response is internally valid.

### Coordinator behavior

For one foreground attempt:

1. Refuse while unauthenticated.
2. Snapshot pending events through the one application-owned queue.
3. Return `nothingPending` when the snapshot is empty.
4. Upload at most 20 events in persisted order.
5. Validate all acknowledged IDs against that batch.
6. Persist queue acknowledgement before reporting success.
7. Leave unacknowledged and unsent events untouched.

Only one attempt may run at a time. A concurrent caller joins the in-flight attempt rather than
creating a second upload. Retries are user/foreground-triggered in this slice; exponential backoff,
connectivity listeners and platform background scheduling remain future work.

## Result and observable state

The coordinator returns a typed result:

- `authenticationRequired`
- `nothingPending`
- `synchronized(acknowledgedCount, remainingCount)`
- `retryableFailure(remainingCount)`

The learner UI may render calm Persian copy derived from this state, such as answers being safely
stored on this device. This slice will add no automatic attempt and no success celebration. It emits
no analytics because consented native analytics is not implemented.

## Failure and no-data-loss rules

- Identity failure, transport exception, timeout, malformed response, or local acknowledgement
  failure must not remove pending events.
- Only IDs from a completely validated response may be passed to `ReviewQueue.acknowledge`.
- An empty acknowledgement is a valid retryable outcome and removes nothing.
- The coordinator never clears the queue, substitutes a server result, or treats an HTTP delivery
  attempt as durable acknowledgement.
- Clock-skew reconciliation remains server-owned. Mobile forwards the original UTC occurrence time.

## Production composition and release boundary

Production Flutter composition receives a signed-out identity adapter and a disabled transport.
Therefore this foundation makes no network request and does not change the current offline learner
journey. A future change must separately implement and review:

- learner identity mapping and token/session lifecycle;
- an authenticated review endpoint and wire schema;
- typed HTTP transport, TLS and timeout policy;
- foreground retry/backoff and optional platform-compliant background work;
- explicit Preview verification and owner-approved activation.

No feature flag, secret, migration, provider call, invitation, public release, Bobo asset, content
asset, payment surface, or production environment changes in this scope.

## Testing

Unit and integration tests must prove:

- signed-out attempts neither read the queue nor call transport;
- empty queues do not call transport;
- batches contain at most 20 events and retain persisted order;
- full and partial acknowledgements remove only exact confirmed IDs;
- unknown or duplicate acknowledgements remove nothing;
- transport and acknowledgement-storage failures retain all applicable pending events;
- concurrent attempts share one transport call;
- production composition remains signed out and transport-disabled;
- existing three-card offline review and secure-storage tests remain green.

Feature-boundary validation remains `pnpm check`, `pnpm build`, migration validation,
`flutter analyze`, `flutter test`, and `flutter build apk --debug`. No physical-device network test is
claimed because networking remains disabled.

## Documentation and rollback

Update the mobile README, offline-sync architecture note, active work registry and stable project
state only at their appropriate branch/merge boundaries. Rollback removes the coordinator and its
disabled production composition; the existing encrypted queue and offline learning loop remain
unchanged and retain all pending events.

## Explicit non-goals

- OTP screens or SMS.ir calls in Flutter
- credential or token persistence
- learner/account database migration
- authenticated review API route
- real HTTP requests or connectivity permissions
- background sync or push notifications
- Preview, Production, beta cohort or Cafe Bazaar activation
