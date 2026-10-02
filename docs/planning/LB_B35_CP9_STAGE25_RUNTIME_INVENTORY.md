# LB-B35 CP9 — Stage 2.5 Runtime Change Inventory (HARD GATE)

**Baseline (Production):** `4ade0a885fa93a418db8cde94b81a206bcd80860` (v1.2.1, `APP_SOURCE_SHA`)
**Candidate:** `ff658a431d2e5ecd2f90a1f72f46ff83d0e6b6f6` (`main`, post-CP8)
**Gate rule:** every non-test runtime file changed between baseline and candidate must be classified
below. **No unexplained file may pass Stage 3.** Verified in-parent against source; a read-only
worker audit corroborated the two learner-visible semantic changes independently.

## Totals

| Scope                                                                      | Count     |
| -------------------------------------------------------------------------- | --------- |
| All files changed `4ade0a88..main`                                         | 205       |
| Non-test runtime files (`apps/website`, `apps/api`, `packages/`)           | 40        |
| Test / fixture files (excluded, do not ship)                               | 38        |
| `apps/admin` files — **excluded from CP9, not in the learner image** (D-4) | 19        |
| Docs / evidence / tooling / CI (do not ship)                               | remainder |

## Category A — FLAG-GATED (19 files, incl. 1 new CP9 file)

Behaviour reachable only when a named flag is set. All flags are **absent in Production**, so at
Stage 3 these files are inert and the learner app behaves as v1.2.1.

| File                                                              | Flag                                                                           |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `apps/api/src/reviews/postgres-review-event.store.ts`             | `LEARNBOX_BINARY_REVIEW`, `LEARNBOX_SCHEDULER_V2`, `LEARNBOX_QUEUE_QUARANTINE` |
| `apps/api/src/reviews/mobile-review-batch.request.ts`             | `LEARNBOX_BINARY_REVIEW`                                                       |
| `apps/api/src/reviews/mobile-review-batch.service.ts`             | `LEARNBOX_SCHEDULER_V2`                                                        |
| `apps/api/src/reviews/scheduler-v2-preflight.ts`                  | `LEARNBOX_SCHEDULER_V2`                                                        |
| `apps/api/src/reviews/binary-review-preflight.ts` _(new, CP9 N1)_ | `LEARNBOX_BINARY_REVIEW`                                                       |
| `apps/api/src/learner-state/learner-state.service.ts`             | `LEARNBOX_SERVER_SESSION_PLAN`                                                 |
| `apps/api/src/learner-state/postgres-learner-state.repository.ts` | `LEARNBOX_SERVER_SESSION_PLAN`                                                 |
| `apps/website/lib/learner-review-web-client.ts`                   | `LEARNBOX_BINARY_REVIEW`                                                       |
| `apps/website/lib/learner-review-web-http.ts`                     | `LEARNBOX_BINARY_REVIEW`                                                       |
| `apps/website/lib/learner-review-web-runtime.ts`                  | `LEARNBOX_QUEUE_QUARANTINE` (+ CP9 preflight wiring)                           |
| `apps/website/lib/learner-review-web-sync.ts`                     | `LEARNBOX_QUEUE_QUARANTINE`, `NEXT_PUBLIC_..._BINARY_REVIEW_UI`                |
| `apps/website/lib/mobile-review-runtime.ts`                       | `LEARNBOX_MOBILE_SESSION_SECRET` (+ CP9 preflight wiring)                      |
| `apps/website/lib/learner-state-web-runtime.ts`                   | `LEARNBOX_SERVER_SESSION_PLAN`, `LEARNBOX_SESSION_SECRET`                      |
| `apps/website/lib/learner-workload.ts`                            | `LEARNBOX_SERVER_SESSION_PLAN`, `LEARNBOX_TODAY_WORKLOAD`                      |
| `apps/website/lib/learner-read-model.ts`                          | `LEARNBOX_TZ_PERSIST`                                                          |
| `apps/website/app/LearnerHome.tsx`                                | 9 × `NEXT_PUBLIC_LEARNBOX_*` (CP9-excluded ones baked `false`)                 |
| `packages/learning-engine/src/offline-sync-quarantine.ts`         | `LEARNBOX_QUEUE_QUARANTINE`                                                    |

**`LEARNBOX_TODAY_WORKLOAD` note.** The audit flagged this as a sixth server flag whose presence in
deployment config was unconfirmed. Verified directly against Production: it is **absent** from the
running container's environment (all six `LEARNBOX_*` feature flags count **0**), and
`todayWorkloadEnabled()` requires the literal `'true'`, so the v1.2.1 `countUnseenCatalogCards` path
is what runs at Stage 3.

**`LEARNBOX_TZ_PERSIST` note.** `learner-read-model.ts` reads `users.timezone` — a **0023 column** —
but returns before that query unless the flag is `true`. Verified at source: the early return guards
the column access, so the file is safe on the pre-0023 Production schema at Stage 3.
| `apps/website/app/components/ProfileScreen.tsx` | `NEXT_PUBLIC_LEARNBOX_GOAL_UX_REMOVED` (Goal section wrapped in `{onChooseGoal ? … : null}`) |
| `apps/website/app/components/SettingsScreen.tsx` | `NEXT_PUBLIC_LEARNBOX_GOAL_UX_REMOVED` + `NEXT_PUBLIC_LEARNBOX_QUEUE_QUARANTINE` |

## Category B — UNCONDITIONAL, BEHAVIOUR-PRESERVING (15 files)

Not flag-gated, but proven not to change learner-visible behaviour.

| File                                                     | Why safe                                                                                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/learning-engine/src/definitions.ts` _(+363)_   | New constants/helpers. `BOX_LOWER_BOUND_DAYS = [0,1,3,7,21]` is **byte-identical** to the old hardcoded `1/3/7/21` thresholds, so no card changes Box. |
| `packages/learning-engine/src/session.ts`                | Replaces literals `12/24/36` with `SESSION_CAPACITY_CARDS{,*2,*3}`; constant is **12** ⇒ identical values.                                             |
| `packages/learning-engine/src/recovery.ts`               | Same substitution, same values.                                                                                                                        |
| `packages/learning-engine/src/review-event.ts`           | Adds **optional** `response?` / `engineVersion?`. Absent ⇒ legacy path unchanged (NULL).                                                               |
| `packages/learning-engine/src/scheduler-v2.ts` _(+204)_  | New V2 engine; dead code unless `LEARNBOX_SCHEDULER_V2`.                                                                                               |
| `packages/learning-engine/src/replay-compat.ts` _(+68)_  | New compat helpers, additive.                                                                                                                          |
| `packages/learning-engine/src/review-session-storage.ts` | Additive storage fields.                                                                                                                               |
| `packages/learning-engine/src/index.ts`                  | Re-exports the new symbols.                                                                                                                            |
| `packages/learning-engine/package.json`                  | Adds export subpaths.                                                                                                                                  |
| `apps/website/lib/learner-summary.ts` _(−49 net)_        | Inlined SQL replaced by shared `learner-read-model` call; same projection.                                                                             |
| `apps/website/lib/learner-state-web-http.ts`             | Response plumbing for gated fields.                                                                                                                    |
| `apps/website/lib/mobile-review-http.ts`                 | Request plumbing for gated fields.                                                                                                                     |
| `apps/website/app/components/AuthGate.tsx`               | Session-expiry copy behind `NEXT_PUBLIC_..._SESSION_EXPIRY_UX` (baked `false`).                                                                        |
| `apps/website/app/components/LogoutPanel.tsx`            | Rendered under `profileIdentityEnabled`; already `true` in Production.                                                                                 |
| `apps/website/app/globals.css` _(+17)_                   | Additive utility classes, no existing selector changed.                                                                                                |

Two files under `apps/website/test/support/` (`forced-teardown-guard.ts`,
`review-events-fingerprint.ts`) are harness-only and never imported by runtime code.

## Category C — UNCONDITIONAL, LEARNER-VISIBLE (7 files) — require explicit owner accept/reject

These ship live the moment Stage 3 deploys. **No flag can turn them off.**

> **Correction (independent audit).** An initial parent pass listed 5 files here. A read-only worker
> audit flagged 7, and **all seven were re-verified at source in-parent and confirmed**. Three
> reclassifications were accepted: `today/route.ts` A→C, `WordsScreen.tsx` B→C, `TodayScreen.tsx`
> A→C. Conversely `ProfileScreen.tsx`/`SettingsScreen.tsx` were moved **C→A** (their Goal section is
> genuinely gated by `NEXT_PUBLIC_LEARNBOX_GOAL_UX_REMOVED`). Category D remains **0** under both
> passes.

### C-1 `apps/website/app/api/learner/today/route.ts` — **MATERIAL, largest learner-visible delta**

`correctToday` changes from `COUNT(*) FILTER (WHERE grade = 'remembered')` to
`activity.accuracyToday.known`, which counts **`hard` + `remembered` + `mastered`** as correct.
`accuracyPercent` follows. Leitner boxes become curriculum-scoped (published packs/versions only).

**Measured on live Production data (90 review events):**

| grade        | events |
| ------------ | ------ |
| `mastered`   | 32     |
| `remembered` | 30     |
| `forgot`     | 21     |
| `hard`       | 7      |

39 of 90 events are `hard`/`mastered` — previously counted as **incorrect**. On this distribution the
displayed accuracy moves from **30/90 ≈ 33%** to **69/90 ≈ 77%**. Learners will see their accuracy
roughly **double**. This is defensible (the new definition matches the Box model's known/unknown
semantics) but it is the single most noticeable change in CP9 and must be an accepted product
decision, not a surprise.

### C-2 `apps/website/app/api/learner/words/route.ts`

`forgotCount` → **`unknownCount`** (field rename); `summary` gains **`learned`** (Box 4+);
**`summary.mastered` narrows from Box 4+ to Box 5 only**; cards in multiple packs are deduplicated;
pack list filtered to published packs.

### C-3 `apps/website/app/api/learner/progress/route.ts`

`cardStates.review` **removed**, `cardStates.learned` added; new top-level `accuracy` block
(`today`/`allTime`/`knownAnswers`/`totalAnswers`); `timeZone` added; packs gain `masteredCards`;
streak and weekday breakdown become timezone-aware.

### C-4 `apps/website/app/api/learner/profile/stats/route.ts`

`stats` gains `masteredCards` + `accuracyPercent`; top-level `timeZone`; per-pack `masteredCards`;
`weeklyActivity` becomes last-7 learner-local days zero-filled (was active UTC days only); CEFR
counts use the Box 4+ `learned` definition; totals count distinct cards.

### C-5 `apps/website/app/components/ProgressScreen.tsx`

`cardStates` contract widens to `{total, new, learning, learned, mastered}`; the mastery ring value
changes from `mastered` (Box 5) to **`learned` (Box 4+)** and its label from **تسلط → یادگیری**;
week bars now map server-provided learner-local day keys instead of client UTC arithmetic.

### C-6 `apps/website/app/components/WordsScreen.tsx`

Progress percentage basis changes from `mastered` to `learned`; headline text **«مسلط شده» → «یاد
گرفته شده»**; summary chip **«مسلط» → «یاد گرفته»**; per-word detail shows `unknownCount`.

### C-7 `apps/website/app/components/TodayScreen.tsx` — visible but inert in value

The «دقیقه» (minutes) stat tile is **unconditionally deleted** — one fewer tile in the stat row.
Impact on the displayed number is nil: v1.2.1 computed
`realMinutes = testLocalMetrics ? studyMinutes : null` where
`testLocalMetrics = process.env.NODE_ENV === 'test' && syncState === 'local-only'`, so in Production
the tile **always rendered an em-dash**. Removing a permanently-empty tile is a cosmetic improvement.

### Impact summary on current Production data

| Change                                        | Cards/events affected today                                          |
| --------------------------------------------- | -------------------------------------------------------------------- |
| `mastered` Box 4+ → Box 5 (C-2, C-4)          | **0** — all 31 schedules are Box 1–2 (30 in Box 1, 1 in Box 2)       |
| Mastery ring `mastered`→`learned` (C-5)       | **0** — both are 0 while every card is Box 1–2                       |
| Words progress % basis (C-6)                  | **0** for the same reason; Persian labels change immediately         |
| Accuracy definition (C-1)                     | **MATERIAL** — 39 of 90 events reclassified as correct (~33% → ~77%) |
| Field renames / shape changes (C-2, C-3, C-4) | Immediate for any API consumer                                       |
| Minutes tile removal (C-7)                    | Tile disappears; it only ever showed «—» in Production               |

**Owner decision required:** accept C-1…C-7 as intended v1.2.2 behaviour, or reject and extract from
CP9. Recommendation: **accept**, with C-1 called out explicitly — the accuracy jump is the one change
a learner will certainly notice, and it should be a deliberate product choice.

### Open question carried from the audit

Whether any **external** consumer (mobile app, Admin tool) reads `forgotCount` or
`cardStates.review` could not be determined from this repository. Native/Dart is unchanged in CP9 and
`MOBILE_REVIEW_SYNC_ENABLED` is absent in Production, so no native client is live on these endpoints;
Admin is excluded per D-4. Residual risk is therefore low but not formally proven to be zero.

## Category D — SCHEMA-RISK (0 files)

**No file in the candidate reads or writes a 0023 column on an unflagged path.** The only 0023
dependencies are `review_events.response` / `engine_version` (flag-gated, now additionally protected
by the CP9 N1 preflight) and `users.timezone` / `learner_daily_plans` (behind `LEARNBOX_TZ_PERSIST`
and `LEARNBOX_SERVER_SESSION_PLAN`). Stage 3 therefore runs safely on the pre-0023 schema.

## Gate verdict

**41 of 41** classified — all 40 changed non-test runtime files plus the one new CP9 file
(`binary-review-preflight.ts`); **zero unexplained, zero duplicated, zero schema-risk**. Counts were
reconciled programmatically against `git diff --name-only 4ade0a88..main` rather than by inspection. Stage 2.5 **PASSES**, conditional on
the owner explicitly accepting the seven Category C changes.
