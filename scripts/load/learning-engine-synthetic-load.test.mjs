import assert from 'node:assert/strict';
import test from 'node:test';

import { runSyntheticLearningEngineLoad } from './learning-engine-synthetic-load.mjs';

test('runs deterministic synthetic schedules without violating learning invariants', () => {
  const result = runSyntheticLearningEngineLoad({
    schedules: 2,
    reviewsPerSchedule: 4,
    queueEvents: 4,
    maxDurationMs: 5_000,
    clock: () => 0,
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

test('fails the aggregate profile when elapsed time exceeds its local guardrail', () => {
  let clockCalls = 0;
  const result = runSyntheticLearningEngineLoad({
    schedules: 1,
    reviewsPerSchedule: 1,
    queueEvents: 1,
    maxDurationMs: 1,
    clock: () => (clockCalls++ === 0 ? 0 : 2),
  });

  assert.equal(result.invariantFailures, 0);
  assert.equal(result.elapsedMs, 2);
  assert.equal(result.passed, false);
});
