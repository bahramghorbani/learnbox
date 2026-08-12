# Stage 24 Synthetic Load Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a repeatable, local-only synthetic load and recovery test foundation for the learner web app without enabling provider, invite, OTP, private-media, beta, or production services.

**Architecture:** A dependency-free Node runner will make only `GET` requests to a local loopback learner-app URL and will reject every other target before sending traffic. It will collect latency and response evidence into a local, ignored report and return a non-zero exit code when a bounded profile exceeds its error or latency budget. Unit tests lock the target guard, route allowlist, profile values and pass/fail summary; a documented operator runbook makes the controlled Preview and rollback boundary explicit.

**Tech Stack:** Node.js 22 built-in `fetch`, `node:test`, TypeScript/Next.js learner app, pnpm, GitHub Actions.

## Global Constraints

- Use synthetic, non-personal data only; do not record a phone number, OTP, invitation code, cookie, secret, or production response body.
- Load traffic may target only `http://127.0.0.1` or `http://localhost` with a fixed port; reject HTTPS, LAN, Preview, Vercel and Production hosts.
- Request only public, read-only learner routes: `/`, `/manifest.webmanifest`, `/offline` and `/icon.svg`; never call owner, invite, OTP, private-media, media-generation, billing or admin routes.
- Do not change feature flags, deploy, invite users, use credentials, or alter canonical Bobo assets.
- Initial budgets are local-baseline gates, not Production SLOs: smoke `10 × 10` requests with zero failures and p95 ≤ `1000ms`; baseline `25 × 20` requests with failure rate < `1%`, p95 ≤ `1500ms` and p99 ≤ `2500ms`.
- Stop scheduling a profile after 5 failed requests, any forbidden redirect/target error, or an aborted operator run; concurrent requests already in flight may complete. Retain only aggregate metrics in an ignored local report.
- Run `pnpm check`, `pnpm build`, `node scripts/validate-migrations.mjs`, and direct load-runner tests before committing.

---

## File structure

- Create `scripts/load/local-learner-load.mjs`: validates the local target, executes a bounded synthetic profile and emits aggregate JSON.
- Create `scripts/load/local-learner-load.test.mjs`: locks target, route, profile and summary behavior without network traffic.
- Create `docs/operations/STAGE_24_LOAD_TESTING.md`: operator runbook, safety boundary, profiles, budgets, recovery procedure and evidence template.
- Modify `package.json`: add explicit local-only smoke and baseline commands.
- Modify `.gitignore`: ignore `.artifacts/load/` reports.
- Modify `docs/operations/PERFORMANCE_BUDGETS.md`: record the Stage 24 local web baseline gates while retaining the pending low-end Android measurements.
- Modify `CURRENT_WORK.md`: record the unmerged Stage 24 branch and its safe boundary.

## Task 1: Define the safe Stage 24 contract and local-only runner

**Files:**

- Create: `scripts/load/local-learner-load.mjs`
- Create: `scripts/load/local-learner-load.test.mjs`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**

- Consumes: `LEARNBOX_LOAD_TARGET` only when it is an approved local loopback HTTP URL; otherwise defaults to `http://127.0.0.1:3010`.
- Produces: `runLocalLearnerLoad({ target, profile, fetchImpl, now })`, returning `{ profile, target, total, failures, failureRate, latencyMs: { p50, p95, p99 }, passed, stopReason }`.
- Produces: `validateLocalTarget(value)` and `selectProfile(value)` for unit tests and command-line validation.

- [ ] **Step 1: Write failing tests for target and profile guards**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { selectProfile, validateLocalTarget } from './local-learner-load.mjs';

test('rejects a Preview or Production URL before requests are made', () => {
  assert.throws(
    () => validateLocalTarget('https://learnbox-r26dxexlj-learn-box.vercel.app'),
    /local loopback HTTP/,
  );
});

test('uses the bounded baseline profile', () => {
  assert.deepEqual(selectProfile('baseline'), {
    clients: 25,
    requestsPerClient: 20,
    maxFailures: 5,
    maxFailureRate: 0.01,
    maxP95Ms: 1500,
    maxP99Ms: 2500,
  });
});
```

- [ ] **Step 2: Run the direct test to verify it fails**

Run: `node --test scripts/load/local-learner-load.test.mjs`

Expected: FAIL because the module and exports do not exist.

- [ ] **Step 3: Implement target validation, fixed routes, bounded profiles and aggregate summary**

```js
const ALLOWED_PATHS = ['/', '/manifest.webmanifest', '/offline', '/icon.svg'];
const PROFILES = {
  smoke: {
    clients: 10,
    requestsPerClient: 10,
    maxFailures: 0,
    maxFailureRate: 0,
    maxP95Ms: 1000,
    maxP99Ms: 1500,
  },
  baseline: {
    clients: 25,
    requestsPerClient: 20,
    maxFailures: 5,
    maxFailureRate: 0.01,
    maxP95Ms: 1500,
    maxP99Ms: 2500,
  },
};

export function validateLocalTarget(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error('Load target must be a local loopback HTTP URL.');
  }
  return url.origin;
}
```

The runner must use `redirect: 'error'`, mark any response outside `200..399` as a failure, never retain a response body, calculate nearest-rank percentiles from elapsed milliseconds, and create `.artifacts/load/` only when writing a local report.

- [ ] **Step 4: Add deterministic summary and early-stop tests**

```js
test('stops after the bounded number of failures without retaining a response body', async () => {
  let calls = 0;
  const result = await runLocalLearnerLoad({
    target: 'http://127.0.0.1:3010',
    profile: 'baseline',
    fetchImpl: async () => {
      calls += 1;
      return { ok: false, status: 503 };
    },
    now: () => calls * 10,
  });
  assert.equal(result.stopReason, 'failure_limit');
  assert.equal(result.failures, 5);
  assert.equal(result.passed, false);
});
```

- [ ] **Step 5: Add explicit pnpm commands and ignored artifacts**

```json
"load:local:smoke": "node scripts/load/local-learner-load.mjs --profile smoke",
"load:local:baseline": "node scripts/load/local-learner-load.mjs --profile baseline"
```

Append `.artifacts/load/` to `.gitignore`.

- [ ] **Step 6: Run direct checks**

Run: `node --test scripts/load/local-learner-load.test.mjs && pnpm format:check && pnpm lint`

Expected: PASS, with no outbound request and no tracked artifact.

- [ ] **Step 7: Commit**

```bash
git add scripts/load/local-learner-load.mjs scripts/load/local-learner-load.test.mjs package.json .gitignore
git commit -m "feat: add local synthetic load runner"
```

## Task 2: Document budgets, recovery and evidence without activating beta

**Files:**

- Create: `docs/operations/STAGE_24_LOAD_TESTING.md`
- Modify: `docs/operations/PERFORMANCE_BUDGETS.md`
- Modify: `CURRENT_WORK.md`

**Interfaces:**

- Consumes: the runner profiles and JSON summary from Task 1.
- Produces: a secret-free, repeatable operator procedure and local evidence template.

- [ ] **Step 1: Write a failing documentation-contract test**

```js
test('Stage 24 runbook forbids non-local targets and real-user data', () => {
  const source = readFileSync('docs/operations/STAGE_24_LOAD_TESTING.md', 'utf8');
  assert.match(source, /127\.0\.0\.1|localhost/);
  assert.match(source, /Production.*forbidden/i);
  assert.match(source, /synthetic/i);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test scripts/load/local-learner-load.test.mjs`

Expected: FAIL because the runbook does not exist.

- [ ] **Step 3: Add the operator runbook**

Document this exact sequence:

```bash
pnpm build
pnpm preview:web
pnpm load:local:smoke
pnpm load:local:baseline
```

Include a separate recovery check: stop the local server during a smoke run, expect `failure_limit`, restart it, then rerun smoke and require `passed: true`. The runbook must state that this is local only and does not prove Preview or Production capacity.

- [ ] **Step 4: Update the performance budget and current-work registry**

Add the two fixed Stage 24 web profiles, their aggregate-only evidence requirements, and the outstanding low-end Android baseline. Record the active branch, no-deploy/no-provider boundary, and next execution task in `CURRENT_WORK.md`.

- [ ] **Step 5: Run documentation and continuity validation**

Run: `pnpm exec prettier --check docs/operations/STAGE_24_LOAD_TESTING.md docs/operations/PERFORMANCE_BUDGETS.md CURRENT_WORK.md && pnpm verify:ai-continuity && git diff --check`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add docs/operations/STAGE_24_LOAD_TESTING.md docs/operations/PERFORMANCE_BUDGETS.md CURRENT_WORK.md
git commit -m "docs: define stage 24 load test boundary"
```

## Task 3: Execute local synthetic profiles and finish the Stage 24 foundation

**Files:**

- Modify: `docs/operations/STAGE_24_LOAD_TESTING.md` only if the aggregate local evidence differs from the documented template.
- Modify: `CURRENT_WORK.md` with the exact remaining Stage 24 work after the foundation is merged.

**Interfaces:**

- Consumes: Task 1 runner and Task 2 runbook.
- Produces: aggregate-only local evidence and a clean PR handoff; does not create a production deployment or a participant cohort.

- [ ] **Step 1: Start the built learner app locally**

Run: `pnpm preview:web`

Expected: Next serves only on `127.0.0.1:3010`.

- [ ] **Step 2: Execute smoke then baseline**

Run: `pnpm load:local:smoke && pnpm load:local:baseline`

Expected: each report has only aggregate metrics, fixed local target and no response body, cookie or personal data.

- [ ] **Step 3: Perform recovery check**

Stop the local server during a smoke profile; confirm `failure_limit`. Restart the same local server and rerun smoke; confirm `passed: true`.

- [ ] **Step 4: Run feature-boundary verification**

Run: `pnpm check && pnpm build && node scripts/validate-migrations.mjs`

Expected: PASS.

- [ ] **Step 5: Create PR, wait for CI and merge only when green**

```bash
git push -u origin feat/stage-24-synthetic-load-foundation
gh pr create --draft --base main --head feat/stage-24-synthetic-load-foundation
gh pr checks --watch
```

The PR must state that load never left loopback, no credentials or real data were used, no flags changed and Production was untouched.

## Self-review

- Spec coverage: Stage 24’s synthetic load, performance-budget, recovery and rollback-safe requirements map to Tasks 1–3. Low-end Android metrics remain explicitly pending rather than fabricated.
- Placeholder scan: no implementation task depends on an unspecified provider, credential, environment, route or metric.
- Type consistency: `validateLocalTarget`, `selectProfile` and `runLocalLearnerLoad` are defined in Task 1 and consumed unchanged by Tasks 1–3.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-12-stage-24-synthetic-load-foundation.md`. Continue inline in this session: execute Tasks 1–3 with TDD, local-only traffic, a green PR, and a clean `main` handoff.
