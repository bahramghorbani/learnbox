import { queueForRetry, scheduleReview } from '../../packages/learning-engine/dist/index.js';

const START_AT = new Date('2026-08-12T00:00:00.000Z');
const GRADES = ['forgot', 'hard', 'remembered', 'mastered'];

const PROFILES = {
  ci: {
    schedules: 10_000,
    reviewsPerSchedule: 10,
    queueEvents: 10_000,
    maxDurationMs: 5_000,
  },
};

function syntheticId(prefix, ordinal) {
  return `${prefix}-${String(ordinal).padStart(6, '0')}`;
}

function sameIds(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function runSyntheticLearningEngineLoad({
  schedules,
  reviewsPerSchedule,
  queueEvents,
  maxDurationMs,
  clock = performance.now.bind(performance),
}) {
  const startedAt = clock();
  let invariantFailures = 0;
  let reviewTransitions = 0;

  for (let scheduleIndex = 0; scheduleIndex < schedules; scheduleIndex += 1) {
    let schedule = {
      state: 'learning',
      stabilityDays: 1,
      difficulty: 5,
      lapses: 0,
      dueAt: START_AT,
    };

    for (let reviewIndex = 0; reviewIndex < reviewsPerSchedule; reviewIndex += 1) {
      const now = new Date(
        START_AT.getTime() + (scheduleIndex * reviewsPerSchedule + reviewIndex) * 60_000,
      );
      schedule = scheduleReview(schedule, GRADES[reviewIndex % GRADES.length], now);
      reviewTransitions += 1;
      if (schedule.dueAt <= now || schedule.difficulty < 1 || schedule.difficulty > 10) {
        invariantFailures += 1;
      }
    }
  }

  const pending = Array.from({ length: queueEvents }, (_, index) => ({
    clientEventId: syntheticId('synthetic-sync', queueEvents - index),
    payload: { kind: 'synthetic-review' },
    attempts: index % 3,
    nextAttemptAt: START_AT,
  }));
  const queuedIds = queueForRetry(pending, START_AT).map(({ clientEventId }) => clientEventId);
  const expectedIds = Array.from({ length: queueEvents }, (_, index) =>
    syntheticId('synthetic-sync', index + 1),
  );
  if (!sameIds(queuedIds, expectedIds)) invariantFailures += 1;

  const elapsedMs = clock() - startedAt;
  return {
    schedulesProcessed: schedules,
    reviewTransitions,
    queuedEvents: queuedIds.length,
    invariantFailures,
    elapsedMs,
    passed: invariantFailures === 0 && elapsedMs <= maxDurationMs,
  };
}

function readProfile() {
  const profileIndex = process.argv.indexOf('--profile');
  const name = profileIndex === -1 ? 'ci' : process.argv[profileIndex + 1];
  const profile = PROFILES[name];
  if (!profile) throw new Error('Learning-engine load profile must be ci.');
  return profile;
}

function main() {
  const result = runSyntheticLearningEngineLoad(readProfile());
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.passed) process.exitCode = 1;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `learning_engine_load_failed: ${error instanceof Error ? error.message : 'unknown'}\n`,
    );
    process.exitCode = 1;
  }
}
