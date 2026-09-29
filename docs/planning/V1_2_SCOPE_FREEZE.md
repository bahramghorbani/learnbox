# LearnBox v1.2.0 — Frozen Scope & Implementation Sequence

**Status:** SCOPE FROZEN by owner decision, 2026-09-29. Implementation authorized. Production deploy NOT authorized.
**Baseline:** `main` @ `406de14`, clean tree. Previous release tag `v1.1.0` → `46cc45e24bfd54fc1f3f23dd0429c2d4ebb3744f` (never moves).
**Planning source:** the v1.2 scope proposal (Option A/B/C) presented to the owner on 2026-09-29; Option B approved.

This document is the frozen target. Implementation is measured against it. Anything discovered
later that is not listed here gets a **new backlog ID** and is reported — it is not silently
absorbed into v1.2.

---

## 1. Approved scope (Option B)

| ID      | Item                                                             | Class           | Priority                       |
| ------- | ---------------------------------------------------------------- | --------------- | ------------------------------ |
| LB-B11  | Home screen reads progress from the server, not device storage   | BUG             | Must                           |
| LB-B26  | Persistent session: sliding renewal, bounded lifetime, revocable | BUG-class       | Must                           |
| LB-B27  | Logout control in Settings                                       | FEATURE (small) | Must                           |
| LB-B23  | Audio control must not flip the card                             | BUG             | Must — reproduce before fixing |
| LB-B22  | Login (phone) + OTP screen redesign                              | UX              | Should                         |
| LB-B24  | Reduce excessive scroll; improve layout/viewport                 | UX              | Should                         |
| LB-B25  | Bobo as a motivational complement, not a standalone section      | UX              | Should                         |
| LB-B28a | Profile fields + prebuilt avatars                                | FEATURE         | Should                         |

**Explicitly deferred, NOT cancelled:** `LB-B19` (notifications/reminders), `LB-B28b` (personal
photo upload, blocked on the `LB-B06` private-storage decision), `LB-B17` (Store / payments /
entitlements / restore purchases).

**Not a v1.2 blocker:** the scheduled restore drill (`LB-B01` residual) remains pending operational
evidence; first real run due `2026-10-05 03:36 UTC`.

---

## 2. Owner decisions (binding)

### LB-B26 — session policy

- **30-day absolute lifetime** — hard cap, not extendable by activity.
- **14-day inactivity expiry** — idle sessions die earlier than the absolute cap.
- **Sliding renewal during valid activity** — within the caps above.
- **Secure server-side revocation** must exist.
- **Immediate invalidation on Logout.**
- **An effectively eternal session is explicitly rejected.**

Both bounds apply simultaneously: a session ends at whichever comes first — 30 days from issue, or
14 days without activity.

### LB-B28a — profile fields

- Fields: **first name, last name, date of birth, gender, prebuilt avatar**.
- **All optional.** None may block onboarding or any learning flow.
- **Phone remains the account/auth identity.** Profile fields are never an identity or login key.
- **Gender must offer "prefer not to say."**
- **Store date of birth, never a calculated age.** Age, if ever displayed, is derived at read time.
- Personal photo upload is **out of scope** (that is LB-B28b).

---

## 3. Implementation sequence

Ordered by the approved dependency graph. Each checkpoint is small, independently testable, and
lands as its own PR. Canonical current-state docs are reconciled **inside the feature PR**, per
`docs/DOCUMENTATION_GOVERNANCE.md` §Review cadence — a separate post-merge docs PR is exceptional.

### CP-0 — LB-B23 investigation (no production code change) — DONE, DID NOT REPRODUCE

Reproduce the audio/flip defect before touching its code, per the owner's instruction. The obvious
hypothesis is already disproven: both audio controls sit inside `stopPropagation` guards
(`LearnerHome.tsx:1092` front, `:1122` back) in the shipped release. Produce a failing test or a
recorded reproduction that identifies the real mechanism. **Exit:** mechanism named with evidence,
or the item is reported as not-reproducible and returned to the owner — never "fixed" by guesswork.

**Outcome:** `apps/website/test/lb-b23-audio-flip.test.tsx` drives the real component through
sign-in → onboarding → review and activates the pronunciation control three ways — click on the
button, click on a child element (the actual tap target), and keyboard activation. **All pass: the
card never flips**, and tapping the card body still flips it, so the animation contract is intact.
The defect does not reproduce through any event path, which rules out event bubbling as the cause.

Remaining hypothesis, geometric rather than behavioural: `.audio-button` is `padding: 9px 12px`
(≈34px tall, below the 44px touch-target guidance) and its guarded wrappers `.card-ipa-row` /
`.card-ex-audio` are bare `display: flex; gap: 8px` with no padding, so the guarded region hugs the
control. A touch landing a few pixels outside it legitimately hits `.flip-container`. This cannot be
proven in jsdom, which has no layout engine, and the repository has no browser/e2e harness.
**Owner input requested:** when it flips, does the audio still play? Audio playing implicates
geometry plus an unguarded path; silence means the tap missed the control entirely and the fix
belongs in CP-5's layout work.

### CP-1 — LB-B26 session lifetime and renewal

Replace the hardcoded `sessionLifetimeSeconds = 60 * 60 * 8` (`apps/website/lib/server-session.ts:4`)
with the approved dual-bound policy plus sliding renewal and server-side revocation.
**Why first:** every other trust fix is observed through a session; fixing the display before the
session would leave the symptom reachable.
**Must re-prove:** authenticated `200`, anonymous `401`, foreign-Origin `403`, logout `204` → `401`.

### CP-2 — LB-B27 logout in Settings

Wire the UI to the already-proven `POST /api/auth/logout`, and clear device-scoped `learnbox:` keys
on the way out, reusing the existing `handleAccountDeleted` clearing pattern
(`LearnerHome.tsx:654`). **Depends on CP-1** — a long-lived session without a logout control is a
privacy gap on a shared device, so these ship together or not at all.

### CP-3 — LB-B11 server-backed progress

Make the home screen read daily count and streak from `/api/learner/progress` (already implemented
and correctly scoped by `user_id`), instead of the device-only
`loadDailyReviewProgress` / `loadLearningStreak`. Device storage may remain an offline cache, but
the server is the source of truth. Also ensure the storage scope cannot silently collapse to
`:account:unverified` and present emptiness as zero.
**Depends on CP-1.**

### CP-4 — LB-B23 fix

Apply the fix identified in CP-0. **The current flip animation must be preserved** (owner
constraint). Kept separate from CP-5/CP-6 so it is provable that the audio defect itself was fixed.

### CP-5 — LB-B24 + LB-B25 layout, scroll, Bobo

Reviewed together because they occupy the same screens and the same vertical budget. Cause is
cumulative: `TodayScreen.tsx` is ~688 lines rendering ~34 stacked blocks, with `.today-intro`
`padding: 54px 6px 28px` and repeated `margin: 10px 16px 0` / `padding: 20px 20px 16px` card
rhythm. Bobo is currently a standalone centered section (`TodayScreen.tsx:639`, inline flex wrapper
around `.bobo-header` 64×92px). Fix by information hierarchy and by folding Bobo into an existing
surface — **not** by a global scale/slider tweak. Measure on real viewports before and after.

### CP-6 — LB-B22 login/OTP redesign

Visual redesign of `AuthGate.tsx` (`stage: 'phone' | 'code'`, `otpLength = 5`). Preserve the proven
OTP error and rate-limit messaging (3 requests / 15 min, `429 request_limited`) and the
`@learnboxsupportbot` recovery path from LB-B08. Behaviour unchanged; presentation improved.

### CP-7 — LB-B28a profile fields + prebuilt avatars

Forward-only migration adding optional columns to `users` (today: `id`, `phone_e164`, `first_name`,
`created_at`). Extend `profile/update`, which currently accepts `firstName` only.
**Ships last** so the only schema change in the release lands on an already-stable base.
Deletion is structurally covered — `DELETE FROM users WHERE id = $1`
(`account-deletion-store.ts:164`) removes the whole row including new columns — but DOB and gender
are **new personal data**, so the privacy notice must be updated **in this same PR**, and deletion
must be re-verified against the new columns.

### CP-8 — release gate

Full v1.2 release gates per `release-guardian`. No Production deploy before they pass.

---

## 4. Checkpoint invariants

Every checkpoint, without exception:

1. Clean tree before starting; branch from current `main`; PR-based merge (no direct pushes).
2. Format with `./node_modules/.bin/prettier` — never `npx` (version mismatch fails the gate).
3. Full CI green before merge; no merging on a partially reported run.
4. Canonical current-state docs reconciled in the same PR; historical documents untouched.
5. `v1.1.0` never moves; Git history is never rewritten.
6. No Production mutation, no deploy, no migration applied to Production.
7. After each merge, confirm Production is unchanged: same image digest, unchanged container start
   time, restart count still 0. Merging code is not deploying it.

---

## 5. Release Definition of Done (owner-approved)

1. Every selected item demonstrated with evidence, not assertion.
2. **LB-B11/B26 proven by a real re-login:** sign in, record reviews, expire the session, sign in
   again, and show the same non-zero counts served by the server — cross-checked against the DB row
   count.
3. Security re-proven in both directions after the session change: authenticated `200`, anonymous
   `401`, foreign-Origin `403`, logout `204` → `401`.
4. Regression tests for every new path, including scope transition on session expiry.
5. Migration (CP-7): forward-only, prerequisites verified, pre-migration backup captured, rollback
   artifacts recorded, row counts unchanged.
6. Privacy notice updated in the same release as the new personal data; deletion re-verified to
   remove the new columns.
7. Production identity re-proven: running `APP_SOURCE_SHA` == image OCI revision == Git commit
   reachable from `main` == release tag.
8. Canonical docs synced per the standing continuity rule; historical records untouched.
9. Anything newly discovered receives a new stable ID rather than being silently fixed or dropped.

---

## 6. Non-goals for v1.2

Listed so they cannot drift in mid-release:

- No payments, entitlements, pack catalog or restore-purchases (`LB-B17`). `/api/store/packs`
  currently returns a hardcoded `404` and Production has `billing_products = 0`; it stays that way.
- No push/reminder infrastructure (`LB-B19`). `public/sw.js` has no `push`/`showNotification`.
- No personal photo upload (`LB-B28b`).
- No media relocation out of the image (`LB-B06`).
- No change to the OTP provider, phone-as-identity model, or protected-media authorization.
- No tag movement, no history rewrite, no repository visibility change.
