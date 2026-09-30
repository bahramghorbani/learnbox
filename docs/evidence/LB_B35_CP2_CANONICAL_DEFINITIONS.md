# LB-B35 CP2 — canonical learning-domain definitions and compatibility layer

**Status:** CP2 complete for owner review. **Nothing here activates scheduler v2, the binary UI, or any Production
change.** No migration was created, no API route or learner screen behavior changed, Admin is untouched.

## Owner decisions carried in (2026-10-01, after CP1)

- **D1** selected ENG-CLAMP as the direction for the next checkpoints — chosen on current evidence, _not_ proof of
  better real-world learning. The CP1 learner-model bias stays documented (`LB_B35_CP1_REPORT.md`).
- **D2** Box 5 = capped ×3 growth, maximum **180 days**. **D3** Unknown moves exactly one Box down (Box 1 stays Box 1).
- **D4** difficulty, lapse penalty and lateness are **not** scheduler inputs. The columns and history stay; `lapses` may
  remain telemetry but must not affect scheduling. _(Nothing in CP2 reads any of them.)_
- CP2 scope: canonical definitions + compatibility only. Scheduler v2 and the binary UI are later checkpoints.

## What was added

| File                                            | Purpose                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/learning-engine/src/definitions.ts`   | The one place that defines Box 1–5, Learned, Mastered, the binary response, the historical grade projection, Accuracy, the local learning day and the streak. Pure; no dependency. Also generates the SQL fragments (`boxCaseSql`, `learnedPredicateSql`, `masteredPredicateSql`, `accuracyCountsSql`) from the _same constants_, so SQL cannot drift from TypeScript. |
| `packages/learning-engine/src/replay-compat.ts` | The replay-mismatch policy as code (below). Pure classifier.                                                                                                                                                                                                                                                                                                           |
| `packages/learning-engine/src/index.ts`         | Re-exports both (the package is already a workspace dependency of `apps/website` and `apps/api`).                                                                                                                                                                                                                                                                      |
| `packages/learning-engine/package.json`         | Adds `./definitions` and `./replay-compat` exports.                                                                                                                                                                                                                                                                                                                    |
| `apps/website/lib/learner-summary.ts`           | One change: `normalizeTimeZone` is now imported from the canonical module instead of being a second copy (behavior identical; same function body).                                                                                                                                                                                                                     |

Everything else in `apps/` is unchanged. `ReviewGrade` is now owned by `definitions.ts` and re-exported, so importers are unaffected.

## Canonical definitions (as implemented)

- **Box:** `stability_days` lower bounds `0 / 1 / 3 / 7 / 21` → Box 1…5 (`<1, <3, <7, <21, ≥21`). These are the thresholds v1.2.1
  already displayed, so **adopting them moves no existing card** (proven below). NaN throws instead of guessing.
- **Learned = Box ≥ 4. Mastered = Box 5.** Mastered is a pure function of Box. `card_schedules.state` is _not_ a definition of
  either (CP0 D2/D9); it stays as legacy telemetry.
- **Binary response:** `known` / `unknown`. `toBinaryResponse` accepts both the four historical grades and the two binary values
  so history written before and after the binary UI reads through one function. Anything else throws — an unrecognised answer is never
  silently counted.
- **Historical projection:** `forgot→unknown`; `hard|remembered|mastered→known`. Total over `ReviewGrade` (adding a grade without
  classifying it is a compile error).
- **Accuracy:** `known / (known + unknown)`, each answer counted once. `null` (not 0) when there are no answers. Counts come from the
  database (`accuracyCountsSql`); the ratio is derived only in TypeScript. **This fixes CP0 D1** (a learner answering only «mastered» was
  reported 0%).
- **Local day:** the calendar day in the learner's IANA zone, never the server's and never UTC (`localDayKey` ≡ Postgres
  `(ts AT TIME ZONE tz)::date`). Unknown/empty/oversized zone degrades to UTC. There is no stored per-user zone yet (see open items).
- **Streak:** consecutive active local days ending today or yesterday; days after _today_ are ignored.

## Evidence

All run on Postgres 17 with every repo migration applied.

### 1. TypeScript ↔ database agreement (`apps/website/test/cp2-canonical-definitions-db.test.ts`, 11 tests)

- **Box / Learned / Mastered:** SQL generated from the constants equals the TS function on ~2,700 values (boundaries ±1e-9, a dense
  sweep, 2,000 pseudo-random values) and on the real `card_schedules.stability_days` column, **with deliberately wrong-looking `state`
  values** (Box ignores them).
- **No existing card moves:** the canonical SQL yields counts identical to the shipped `progress` route's hand-written Box query.
- **Accuracy:** SQL counts for all four stored grades equal the TS counts; every value the database `CHECK` admits is classified;
  the `CHECK` admits exactly the four historical grades.
- **Local day:** `localDayKey` ≡ `AT TIME ZONE` across 6 zones, DST edges, midnight boundaries and a leap day.
- **Streak:** canonical `computeStreak` ≡ the shipped server-authoritative summary SQL on 6 histories (including 00:30-local events
  that straddle the UTC day — CP0 D3).
- **Append-only:** every canonical read leaves the `review_events` fingerprint unchanged; stored answers remain the four historical grades.

### 2. Unit tests (`packages/learning-engine/test/definitions.test.ts`, 43 tests)

Boundaries, monotonicity, NaN, Learned/Mastered, projection totality and rejection of unknown answers, Accuracy rounding and null,
DST/zone normalization, day arithmetic, streak rules, SQL fragment shape and SQL-injection refusal for column names.

### 3. Drift guard (`apps/website/test/cp2-no-redefinition-guard.test.ts`)

Scans `apps/website`, `apps/api` and `apps/admin` sources for hand-written copies of the rules. The audited legacy copies are an
explicit allowlist that **may only shrink**; a new copy fails the build, and a listed copy that was already migrated also fails.
Admin is scanned and currently has none. The guard immediately found two copies the manual audit missed (a grade union in
`LearnerHome.tsx`, a `date_trunc('day')` in `profile/stats`).

### 4. Historical replay compatibility (policy + measurement)

CP1 found that replaying history through v1 reproduces the stored schedule exactly for 22 of 31 cards in the Production backup and
differs for 9 (8 by exactly 10/9 in stability; one by 0.529). Re-measured with the canonical Box:

> **All 9 mismatched cards are in the same canonical Box (Box 1) whether read from the stored row or from the replay. 0 Box conflicts.**

Policy, encoded in `replay-compat.ts` so no later checkpoint re-decides it: (1) the **stored** schedule is authoritative for Box,
Learned and Mastered; (2) replay is a verification instrument only; (3) a difference that keeps the Box is tolerated (`same-box`),
one that changes it is a `conflict` and is reported, never auto-corrected. **No history or schedule is rewritten.** The cause of the
10/9 factor is still unproven — recorded as an open item, not papered over.

### 5. The Known-answer progression invariant (`packages/learning-engine/test/cp2-progression-invariant.test.ts`, 7 tests)

Characterized on the **unmodified shipped engine** using the Known path of ENG-CLAMP (factor 1.8), cross-checked against the CP1
simulator traces. On-time, every answer Known, no scheduler change:

| Box reached          | Answers needed                              |
| -------------------- | ------------------------------------------- |
| leaves Box 1 → Box 2 | **6** (answers 1–5 leave the card in Box 1) |
| Box 3                | 8                                           |
| Box 4 (Learned)      | 9                                           |
| Box 5 (Mastered)     | 11                                          |

8 of the first 12 Known answers leave the Box label unchanged; the underlying interval still grows on every answer. Candidate
invariants, each _computed_ (not assumed):

| Candidate invariant                                             | Holds under ENG-CLAMP? |
| --------------------------------------------------------------- | ---------------------- |
| **S** every on-time Known answer advances one Box until Box 5   | **No**                 |
| **M5** at most 5 consecutive Known answers without a Box change | Yes                    |
| **M3** at most 3 consecutive Known answers without a Box change | **No**                 |
| **E12** Box 5 reached within 12 on-time Known answers           | Yes                    |
| **G** the interval grows on every Known answer                  | Yes                    |

**I did not choose an invariant and did not change the scheduler.** Any invariant stricter than M5 (S or M3) _materially changes
ENG-CLAMP_ (it needs a different Box-1 ladder), which your instruction says to stop and report rather than solve. See owner decision O1.

## Conflicts newly discovered

1. **Shipped streak SQL (LB-B11) drops the entire current streak** if a clock-skew-accepted review (ingest allows +5 min) lands on a
   local day after _today_. Reproduced and pinned as a `DEFECT` test; canonical `computeStreak` ignores future days. Fix belongs in CP3.
2. **Two legacy copies** the manual audit missed (see drift guard).
3. `review-events` ingest and the DB `CHECK` accept only the four historical grades — the binary values cannot be stored until a
   migration (CP4); this is expected, not a defect, but it gates CP5.

## Migrations

**None proposed or created in CP2.** The next number remains `0023`. A CP4 migration (binary `response` column, `scheduler_version`)
is still gated on the 2026-10-05 restore drill, and must be additive so the existing fingerprint (`review-events-fingerprint.ts`) of
historical rows is unchanged.

## Open items / owner decisions

- **O1 — progression invariant:** keep ENG-CLAMP as selected and accept **M5** (+E12, G) as the learner-facing invariant, _or_
  require a stricter one (S or M3), which reopens the policy (report required before any change).
- **O2 — stored learner time zone:** days are bucketed per request today; a stored per-user zone would make Admin and exports
  agree with the learner. Needs a decision (and a CP4 migration) before Admin can reproduce learner-local days.
- **O3 — Admin consumption:** `apps/admin` has no dependency on `@learnbox/learning-engine`, and Admin is contained. Importing the
  canonical module is a CP3+ task and must not be done before the Admin exposure gate.

## Can CP3 begin?

Yes, conditionally on **O1**: CP3 (route migration to the canonical module, accuracy and streak fixes) does not depend on the
scheduler, so it can start once O1 is answered or explicitly deferred. The restore drill (2026-10-05) gates CP4, not CP3.
