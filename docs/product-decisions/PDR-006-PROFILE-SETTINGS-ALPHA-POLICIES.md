# PDR-006 — Closed-alpha Profile and Settings policies

- **Status:** approved
- **Date:** 2026-09-08

## Context

The M3 Profile and Settings contract identified three product decisions that block a truthful first implementation: where Profile lives in learner navigation, whether sign out may be exposed before local pending data is account-scoped, and whether the closed alpha should show an account-deletion entry before a real deletion operation exists.

The owner selected all three recommended fail-closed options after the design-only contract and its cross-account risk were presented.

## Decision

1. Profile is the fourth persistent learner destination after Today, Words and Progress on Web and Android. Settings remains a child surface opened from Profile; it is not a fifth bottom-navigation item.
2. Do not expose learner sign out until review events, personal vocabulary and other pending local learner data are durably partitioned by the authenticated account and cross-account isolation is verified. The absence of a sign-out control is explicit closed-alpha behavior, not evidence that sign out is complete.
3. Do not show an account-deletion entry in the closed alpha until a real authenticated deletion or owner-approved support-handoff process exists.

## Rationale

A fourth destination matches the canonical information architecture and keeps account/status information discoverable. Hiding sign out avoids both loss of unacknowledged learning work and accidental submission or exposure under a later account. Hiding deletion avoids a fake or operationally unsupported destructive control.

## Affected systems

Learner navigation, Profile and Settings UI, local review and personal-vocabulary stores, future profile/session APIs, support operations and account-deletion work.

## Consequences and implementation notes

- M3-P1 may implement the fourth destination and a truthful Profile foundation without adding sign out or deletion.
- M3-S1 may implement device-local sound and goal settings only within the approved data-truth boundary.
- Account-scoped local storage and sign out remain a separate security-sensitive serial task.
- Account deletion remains a separately reviewed server, privacy and operations task.
- Purchases, reminders, notification delivery, profile identity reads and Production activation remain outside this decision.

## Reversibility

The navigation placement can be changed through a later owner-approved design decision. The fail-closed absence of sign out and deletion adds no destructive state and can be replaced only after their prerequisites are implemented and verified.
