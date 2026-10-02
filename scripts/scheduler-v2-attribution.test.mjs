/**
 * LB-B35 CP15 (Workstream C): unit tests for the V2 attribution logic.
 *
 * Pure-function tests only — no database. They pin the classification rules that a future
 * Scheduler V2 observation will rely on, including the case that actually matters: a schedule whose
 * history mixes legacy (NULL/1) and V2 (2) events cannot be treated as purely V2-attributed.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifySchedules,
  diffFingerprints,
  fingerprintSchedules,
} from './scheduler-v2-attribution.mjs';

const schedule = (user, card) => ({
  user_id: user,
  card_id: card,
  state: 'review',
  stability_days: 1.8,
  difficulty: 5,
  lapses: 0,
  due_at: new Date('2026-10-04T00:00:00.000Z'),
  last_reviewed_at: new Date('2026-10-03T00:00:00.000Z'),
});

test('fingerprint is order-independent and change-sensitive', () => {
  const a = fingerprintSchedules([schedule('u1', 'c1'), schedule('u1', 'c2')]);
  const b = fingerprintSchedules([schedule('u1', 'c2'), schedule('u1', 'c1')]);
  assert.equal(a.sha256, b.sha256, 'row order must not change the fingerprint');
  assert.equal(a.rows, 2);

  const changed = fingerprintSchedules([
    { ...schedule('u1', 'c1'), stability_days: 1.8000000001 },
    schedule('u1', 'c2'),
  ]);
  assert.notEqual(
    a.sha256,
    changed.sha256,
    'a tiny stability_days change must change the fingerprint',
  );
});

test('a NULL last_reviewed_at is distinguished from an empty string', () => {
  const withNull = fingerprintSchedules([{ ...schedule('u1', 'c1'), last_reviewed_at: null }]);
  const withDate = fingerprintSchedules([schedule('u1', 'c1')]);
  assert.notEqual(withNull.sha256, withDate.sha256);
});

test('classifies V1-only, V2-only, mixed and event-less schedules', () => {
  const schedules = [
    schedule('u1', 'legacy'),
    schedule('u1', 'v2'),
    schedule('u1', 'mixed'),
    schedule('u1', 'orphan'),
  ];
  const eventsByPair = new Map([
    ['u1|legacy', new Set([null])],
    ['u1|v2', new Set([2])],
    ['u1|mixed', new Set([null, 2])],
  ]);

  const result = classifySchedules({ schedules, eventsByPair });

  assert.deepEqual(result.v1Only, ['u1|legacy']);
  assert.deepEqual(result.v2Touched, ['u1|v2']);
  assert.deepEqual(result.mixed, ['u1|mixed'], 'mixed history must never count as pure V2');
  assert.deepEqual(result.noEvents, ['u1|orphan']);
});

test('engine_version 1 is treated as legacy, not as V2', () => {
  const result = classifySchedules({
    schedules: [schedule('u1', 'c1')],
    eventsByPair: new Map([['u1|c1', new Set([1])]]),
  });
  assert.deepEqual(result.v1Only, ['u1|c1']);
  assert.deepEqual(result.v2Touched, []);
});

test('diff reports unattributed writes when new events are not V2-stamped', () => {
  const baseline = {
    schedules: { rows: 31, sha256: 'a'.repeat(64) },
    events: { total: 97, engineV2: 0 },
    replayDrift: { sha256: 'd'.repeat(64) },
  };
  const current = {
    schedules: { rows: 31, sha256: 'b'.repeat(64) },
    events: { total: 100, engineV2: 2 },
    replayDrift: { sha256: 'd'.repeat(64) },
  };

  const diff = diffFingerprints(baseline, current);

  assert.equal(diff.newEvents, 3);
  assert.equal(diff.newV2Events, 2);
  assert.equal(diff.schedulesChanged, true);
  assert.equal(diff.driftSetStable, true);
  assert.notEqual(
    diff.newEvents,
    diff.newV2Events,
    'an unattributed write must be visible in the diff',
  );
});

test('a changed pre-existing drift set is reported as unstable', () => {
  const diff = diffFingerprints(
    {
      schedules: { rows: 31, sha256: 'a'.repeat(64) },
      events: { total: 97, engineV2: 0 },
      replayDrift: { sha256: 'd'.repeat(64) },
    },
    {
      schedules: { rows: 31, sha256: 'a'.repeat(64) },
      events: { total: 97, engineV2: 0 },
      replayDrift: { sha256: 'e'.repeat(64) },
    },
  );
  assert.equal(diff.driftSetStable, false);
});
