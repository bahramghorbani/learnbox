# LB-B35 CP3 — learner read paths on the canonical definitions

Status: complete, awaiting owner review. No scheduler, write-path, binary-UI, Admin, Store or Production change. **No migration.**
Branch `feat/lb-b35-cp3-canonical-read-paths`. Base: `main` at CP2 (`f1cd8a2`).

## 1. Duplicate definitions removed

| Was                                                                                                                                                      | Now                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `progress` route: `CASE WHEN stability_days …` Box SQL, `state='mastered'` for the ring, `state IN ('review','mastered')` for learned/CEFR/pack progress | `lib/learner-read-model.ts` (`boxCaseSql`, `learnedPredicateSql`, `masteredPredicateSql` from `definitions.ts`) |
| `progress` route: ring denominator = number of _scheduled_ cards                                                                                         | denominator = published curriculum (`readCurriculumProgress`); equals the pack total                            |
| `words` route: own Box classification, `Mastered` chip = Box 5 only                                                                                      | same read model; new `learned` field; the screen shows **learned** (Box 4+)                                     |
| `profile/stats`: `state` buckets, `date_trunc('day')` in UTC, a fixed-week window, no Accuracy                                                           | read model; learner-local days; canonical streak; Accuracy added                                                |
| `today` route: `grade='remembered'` as the only "correct" answer (Accuracy)                                                                              | `accuracyCountsSql` / `computeAccuracy` (hard, remembered, mastered = known)                                    |
| `learner-summary.ts`: its own streak SQL (dropped a run ending after "today") and day bucketing                                                          | delegates to `readLearnerActivity`; `computeStreak` ignores future days                                         |
| `ProgressScreen.tsx`: browser-side 7-day window, UTC day arithmetic                                                                                      | straight map of the server's seven learner-local, zero-filled days; `tz` is sent                                |
| `LearnerHome.tsx`: `type Grade = 'forgot'                                                                                                                | …`, local `computeLeitnerDist`, local `computeAccuracy`, a `Date.now()` "study minutes"                         | `ReviewGrade` from the engine; local math and the fabricated minutes removed |
| `TodayScreen.tsx`: props `leitnerDist`, `accuracy`, `studyMinutes`; a "minutes" stat card                                                                | props and card removed. The API already returned `studyMinutesToday: null`                                      |
| `apps/api` `mobile-review-batch.{request,service}.ts`: `new Set(['forgot',…])`                                                                           | `isReviewGrade` / `ReviewGrade`                                                                                 |
| `lib/learner-review-web-{sync,client,http}.ts`, `mobile-review-http.ts`: grade union literals                                                            | `ReviewGrade`                                                                                                   |

Drift-guard allowlist: **8 entries → 0** (see §6).

Two behaviours changed on purpose while doing this, both in the canonical layer:

- `normalizeTimeZone` now accepts IANA names only. A fixed offset such as `+03:30` previously passed `Intl` but Postgres reads the same text as a POSIX zone with the **opposite sign**, so TypeScript and SQL could put one review on different days. It falls back to UTC. (Consistent with O2: IANA, not offset.)
- The "Mastered" label on the Words screen and the progress ring now read **Learned** (Box 4+), which is what they measured. Mastered (Box 5) stays available in the payloads.

## 2. Before / after on the restored real dataset

Dataset: Production backup `learnbox-20260930T175614Z.sql.gz`, restored into a throw-away Postgres 17 (2 learners, 76 review events, 31 schedules, 35 published cards). Both columns come from the **real route handlers** run against that restore (`cp3-cross-screen-real-dataset.test.ts`, opt-in via `LB_REAL_DB_URL`); "before" is the same harness on the unmodified CP2 code. Learners are ordinals; no identifiers are recorded. Zone `Asia/Tehran`.

| Value                                     | Learner | Before (CP2)             | After (CP3)              |
| ----------------------------------------- | ------- | ------------------------ | ------------------------ |
| Curriculum total: Progress ring / Profile | 1       | 16 / 16                  | **35 / 35**              |
| Words total                               | 1       | 35                       | 35                       |
| "Learned": Words / ring / pack / Profile  | 1       | 0 / 0 / **15** / **15**  | 0 / 0 / 0 / 0            |
| "Learned": Words / ring / pack / Profile  | 2       | 0 / 0 / **1** / **1**    | 0 / 0 / 0 / 0            |
| New / Learning: Progress                  | 1       | 0 / 1                    | 19 / 16                  |
| New / Learning: Progress                  | 2       | 0 / 14                   | 20 / 15                  |
| Box row (Today = Progress)                | 1 / 2   | 16,0,0,0,0 / 15,0,0,0,0  | unchanged                |
| Progress streak (current / longest)       | 1       | 1 / 2                    | 1 / 2                    |
| Progress streak (current / longest)       | 2       | **3 / 3** (Today said 1) | **1 / 1** (Today says 1) |
| Profile Accuracy                          | 1 / 2   | absent                   | 69 % / 94 %              |
| Study minutes                             | 1 / 2   | `null` on Today          | `null`; card removed     |

What this shows:

- **Every card in the real data sits in Box 1** (all stabilities < 1 day), so the truthful "Learned" is 0 for both learners. v1.2.1 reported 15 and 1 on the pack/Profile screens because those counted `state='review'`. The four screens now agree.
- The ring moves from "x of _my scheduled cards_" to "x of the curriculum".
- Learner 2's Progress streak drops from 3 to 1 because Progress bucketed in UTC while Today used Tehran. Verified directly in the restore: the learner's later events fall on UTC days Sep 28, 29 and 30 (consecutive, streak 3) but on Tehran days Sep 28 and Sep 30 (one review at 00:xx Tehran on Sep 30 is still Sep 29 in UTC), so the Tehran streak is 1. Today was already right; Progress now agrees with it.
- Harness note: the "before" weekly-activity dates in the raw capture are shifted one day earlier because the old code returned a `date` that `pg` parsed in the host time zone; the counts are the same, and this defect is gone with the fix.

## 3. Time zone and midnight edges (Postgres 17, `cp3-canonical-read-paths-db.test.ts`)

- Tehran: `2026-10-01T20:29:59Z` (23:59:59) and `20:30:00Z` (00:00:00) are two different days; "today" flips at exactly that instant; the same two events are one day in UTC. Reading under another zone does not change the events.
- Today, Progress and Profile split the same events at the same Tehran midnight and return identical seven-day windows.
- Europe/Berlin across the spring-forward night (a 23-hour day): days = 1 / 2 / 1, streak 3.
- Missing, empty, invalid, 65-character, `+03:30` and path-like zones all resolve to **UTC**, never an error.

## 4. Streak fix

v1.2.1 returned `streakDays = 0` when a clock-skew-accepted review (+5 minutes) landed on a local day after "today". Test: three active days plus a review at 00:01 tomorrow, checked at 23:56 → `3 / 3` (was 0). Also pinned: yesterday still counts, and a full empty day breaks the streak.

## 5. History unchanged

`review_events` fingerprint (count + md5 over every row) on the restored production data, before and after running all four routes for both learners: `{n: 76, md5: ba67b00bb1d7a1fbbc0165acc15f4642}` — identical. Every DB test also asserts an unchanged per-learner fingerprint after reading.

## 6. Drift-guard allowlist

`LEGACY = {}` in `cp2-no-redefinition-guard.test.ts` (was 8 entries). The guard still scans Admin, and any new hand-written Box threshold, learned predicate, grade set or day bucket fails the build.

## 7. Newly discovered conflicts

1. **The `state` column cannot be trusted as a progress signal.** All 15–16 cards per real learner are `state='review'` while stability < 1 day. No screen reads it now; the write path still sets it. Decide in CP4/CP5 whether to stop writing it or keep it as telemetry.
2. The real data shows **no learner has a card above Box 1**. ENG-CLAMP's progression invariant (O1) matters in practice, not just in simulation.
3. `apps/api` and the website still carry the **write-path** scheduler; unchanged here by design.

## 8. Is CP4 safe to begin?

Technically yes: CP3 is schema-neutral and leaves the read side ready for additive columns (per-user IANA zone, binary response). CP4 must still wait for the 2026-10-05 restore drill and owner approval.
