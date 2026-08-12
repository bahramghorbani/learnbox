# Performance budgets

Exact mobile targets follow baseline profiling on representative low-end Android devices. Initial
gates: measure cold start, screen transition, card flip, local grade submission, sync, image/audio
start, crash-free sessions, ANR, and website Core Web Vitals before beta.

## Stage 24 local learner-web baseline

Before beta, the local learner app must pass the synthetic, loopback-only protocol in
[`STAGE_24_LOAD_TESTING.md`](./STAGE_24_LOAD_TESTING.md). The smoke profile is 100 public read-only
requests with zero failures, p95 at or below 1000ms and p99 at or below 1500ms. The baseline
profile is 500 equivalent requests with failure rate below 1%, a hard stop at five failures, p95 at
or below 1500ms and p99 at or below 2500ms. Evidence is aggregate-only; no request body, response
body, cookie, credential or personal data is retained.

These gates intentionally exclude Preview and Production traffic. They provide a reproducible
local regression signal while low-end Android and real-environment capacity baselines remain
unmeasured.

## Stage 24 learning-engine synthetic guardrail

`pnpm test:engine-load` builds the shared learning engine then executes 10,000 deterministic card
schedules with 10 review transitions each, plus 10,000 deterministic retry-queue events. It fails
if any next due time is not future-facing, difficulty leaves its `1..10` bound, retry ordering is
unstable, or the local process exceeds 5000ms. The first local run completed 100,000 transitions
and 10,000 queue events with zero invariant failures in 29ms.

This is a CPU-only, aggregate local regression guardrail. It does not measure Flutter rendering,
physical Android behavior, Preview capacity or Production capacity.
