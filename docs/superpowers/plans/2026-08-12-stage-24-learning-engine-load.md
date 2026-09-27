# Stage 24 Learning Engine Load Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, synthetic local load profile that exercises LearnBox review scheduling and offline-queue ordering without user data, a database, a provider or network traffic.

**Architecture:** A Node runner imports the built learning-engine package and creates a fixed number of synthetic review schedules and retryable sync events. It records only aggregate count, invariant failures and elapsed time; the profile fails when any schedule violates its consumer-visible bounds, when queue ordering is nondeterministic, or when the bounded workload exceeds the documented local guardrail.

**Tech Stack:** Node.js 22, TypeScript learning engine, Vitest, pnpm.

## Global Constraints

- Use synthetic IDs and fixed timestamps only; do not include real user, card, phone, OTP, invite, credential, provider, network or database data.
- Do not make network requests, change release flags, deploy, send notifications or mutate canonical Bobo assets.
- Exercise `scheduleReview` and `queueForRetry` as real public learning-engine behavior, not a source-text assertion or mock call-count test.
- The profile is a local regression guardrail, not a Preview or Production capacity claim.
- The CI profile is exactly 10,000 schedules with 10 review transitions each and 10,000 pending sync events; it must finish within 5,000ms on the executing Node process and produce zero invariant failures.
- Run focused tests, `pnpm check`, `pnpm build`, and migration validation before merge.

---

## File structure

- Create `scripts/load/learning-engine-synthetic-load.mjs`: built-package runner, synthetic fixtures, aggregate results and CLI exit status.
- Create `scripts/load/learning-engine-synthetic-load.test.mjs`: contract tests for deterministic workload, schedule bounds, queue ordering and budget failure.
- Modify `package.json`: add the direct engine-load command and include it in `pnpm check`.
- Modify `docs/operations/PERFORMANCE_BUDGETS.md`: record the Stage 24 engine guardrail separately from mobile-device measurements.
- Modify `docs/operations/STAGE_24_LOAD_TESTING.md`: link the engine profile and clarify its local-only scope.
- Modify `CURRENT_WORK.md`: record the active unmerged branch and its no-network boundary.

## Task 1: Create a test-first deterministic engine-load runner

**Files:**

- Create: `scripts/load/learning-engine-synthetic-load.mjs`
- Create: `scripts/load/learning-engine-synthetic-load.test.mjs`

**Interfaces:**

- Consumes: `scheduleReview(schedule, grade, now)` and `queueForRetry(pending, now)` from `packages/learning-engine/dist/index.js`.
- Produces: `runSyntheticLearningEngineLoad({ schedules, reviewsPerSchedule, queueEvents, maxDurationMs, now })` returning `{ schedulesProcessed, reviewTransitions, queuedEvents, invariantFailures, elapsedMs, passed }`.

- [ ] **Step 1: Write the failing behavior tests**

```js
test('runs deterministic synthetic schedules without violating due time or difficulty bounds', () => {
  const result = runSyntheticLearningEngineLoad({
    schedules: 2,
    reviewsPerSchedule: 4,
    queueEvents: 4,
    maxDurationMs: 5000,
    now: fixedNow,
  });
  assert.deepEqual(result, {
    schedulesProcessed: 2,
    reviewTransitions: 8,
    queuedEvents: 4,
    invariantFailures: 0,
    elapsedMs: 0,
    passed: true,
  });
});
```

The break this catches is a scheduler regression that returns a past due date, out-of-bound difficulty, or nondeterministic retry ordering under a repeated synthetic workload.

- [ ] **Step 2: Run the direct test to verify it fails**

Run: `pnpm --filter @learnbox/learning-engine build && node --test scripts/load/learning-engine-synthetic-load.test.mjs`

Expected: FAIL because the runner module is missing.

- [ ] **Step 3: Implement the minimal workload and aggregate invariants**

```js
const grades = ['forgot', 'hard', 'remembered', 'mastered'];
const start = new Date('2026-08-12T00:00:00.000Z');

for (let index = 0; index < schedules; index += 1) {
  let schedule = { state: 'learning', stabilityDays: 1, difficulty: 5, lapses: 0, dueAt: start };
  for (let review = 0; review < reviewsPerSchedule; review += 1) {
    const now = new Date(start.getTime() + (index * reviewsPerSchedule + review) * 60_000);
    schedule = scheduleReview(schedule, grades[review % grades.length], now);
    if (schedule.dueAt <= now || schedule.difficulty < 1 || schedule.difficulty > 10) failures += 1;
  }
}
```

Build a 10,000-event retry queue with `nextAttemptAt` distributed across four fixed minutes. Call
`queueForRetry` twice with the same `now`; compare its IDs to an independently hand-derived sorted
copy and count an invariant failure if either order differs.

- [ ] **Step 4: Add the duration-budget failure test**

```js
test('fails the aggregate profile when elapsed time exceeds its local guardrail', () => {
  const result = runSyntheticLearningEngineLoad({
    schedules: 1,
    reviewsPerSchedule: 1,
    queueEvents: 1,
    maxDurationMs: 1,
    now: () => 2,
  });
  assert.equal(result.passed, false);
});
```

- [ ] **Step 5: Run focused tests**

Run: `pnpm --filter @learnbox/learning-engine build && node --test scripts/load/learning-engine-synthetic-load.test.mjs`

Expected: PASS without any network call.

- [ ] **Step 6: Commit**

```bash
git add scripts/load/learning-engine-synthetic-load.mjs scripts/load/learning-engine-synthetic-load.test.mjs
git commit -m "feat: add synthetic learning engine load runner"
```

## Task 2: Integrate the local guardrail and document its limits

**Files:**

- Modify: `package.json`
- Modify: `docs/operations/PERFORMANCE_BUDGETS.md`
- Modify: `docs/operations/STAGE_24_LOAD_TESTING.md`
- Modify: `CURRENT_WORK.md`

**Interfaces:**

- Consumes: Task 1 CLI profile `--profile ci`.
- Produces: `pnpm test:engine-load` and a clear distinction between engine, web and Android evidence.

- [ ] **Step 1: Add the exact command**

```json
"test:engine-load": "pnpm --filter @learnbox/learning-engine build && node scripts/load/learning-engine-synthetic-load.mjs --profile ci"
```

Add `pnpm test:engine-load` after `pnpm test:load` in the root `check` command.

- [ ] **Step 2: Document scope and measured aggregate result**

Add the 10,000 × 10 review-transition and 10,000 queue-event profile to the performance budget.
Record the one measured aggregate duration only after an actual local run. State that it neither
measures Flutter rendering nor grants Preview/Production capacity.

- [ ] **Step 3: Update active work**

Record the branch, synthetic-only boundary and the next merge/CI action in `CURRENT_WORK.md`.

- [ ] **Step 4: Validate**

Run: `pnpm test:engine-load && pnpm format:check && pnpm lint && git diff --check`

Expected: PASS with no network, provider or personal-data interaction.

- [ ] **Step 5: Commit**

```bash
git add package.json docs/operations/PERFORMANCE_BUDGETS.md docs/operations/STAGE_24_LOAD_TESTING.md CURRENT_WORK.md
git commit -m "docs: record engine load guardrail"
```

## Task 3: Feature-boundary verification and merge

**Files:**

- Modify: `CURRENT_WORK.md` only if the exact remaining work changes before PR creation.

**Interfaces:**

- Consumes: the runner, command and documentation from Tasks 1–2.
- Produces: a green PR that leaves Production, Preview, flags and providers unchanged.

- [ ] **Step 1: Run full verification**

Run: `pnpm check && pnpm build && node scripts/validate-migrations.mjs`

Expected: PASS.

- [ ] **Step 2: Create a draft PR and wait for every CI gate**

Run:

```bash
git push -u origin feat/stage-24-learning-engine-load
gh pr create --draft --base main --head feat/stage-24-learning-engine-load
gh pr checks --watch
```

The PR must state that the profile used fixed synthetic data, made no network request and does not
prove Preview or Production capacity.

## Self-review

- Spec coverage: the Stage 24 synthetic load and recovery requirement is covered without claiming unavailable Android or real-environment data.
- Placeholder scan: the profile size, function names, command and invariant behavior are explicit.
- Type consistency: the runner returns the exact aggregate object used by the tests and CLI.

## Execution Handoff

Plan is saved at `docs/superpowers/plans/2026-08-12-stage-24-learning-engine-load.md`. Execute inline in this session, keeping the existing branch and no-network boundary.
