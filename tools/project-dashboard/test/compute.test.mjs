import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  statusPercent,
  classifyTasks,
  activeTaskPercent,
  releaseReadiness,
  storyboardProgress,
  mergeLiveTasks,
} from '../compute.mjs';
import { RELEASE_CHECKLIST } from '../config.mjs';

test('RELEASE_CHECKLIST weights sum to 100 (committed contract)', () => {
  const total = RELEASE_CHECKLIST.reduce((s, i) => s + i.weight, 0);
  assert.equal(total, 100);
});

test('statusPercent returns documented mapping value', () => {
  assert.equal(statusPercent('in-progress'), 60);
  assert.equal(statusPercent('done'), 100);
  assert.equal(statusPercent('accepted'), 100);
  assert.equal(statusPercent('blocked'), 5);
  assert.equal(statusPercent('not-started'), 10);
  assert.equal(statusPercent(undefined), 0);
});

test('statusPercent throws on unknown status (fail loud, not invent)', () => {
  assert.throws(() => statusPercent('wip'), /Unknown task status: wip/);
});

const TASKS_FIXTURE = [
  { id: 'A', status: 'done' },
  { id: 'B', status: 'in-progress' },
  { id: 'C', status: 'review-requested' },
  { id: 'D', status: 'not-started' },
  { id: 'E', status: 'blocked' },
];

test('classifyTasks splits into completed/current/remaining', () => {
  const { completed, current, remaining } = classifyTasks(TASKS_FIXTURE);
  assert.deepEqual(
    completed.map((t) => t.id),
    ['A'],
  );
  assert.deepEqual(
    current.map((t) => t.id),
    ['B', 'C'],
  );
  assert.deepEqual(
    remaining.map((t) => t.id),
    ['D', 'E'],
  );
  assert.equal(completed[0].percent, 100);
  assert.equal(current[0].percent, 60);
});

test('activeTaskPercent reports mapped value for the active task', () => {
  assert.equal(activeTaskPercent({ status: 'in-progress' }), 60);
  assert.equal(activeTaskPercent({ status: 'blocked' }), 5);
});

test('releaseReadiness computes weighted score, blockers and formula', () => {
  const checklist = [
    { id: 'x1', label: 'a', weight: 10, met: true },
    { id: 'x2', label: 'b', weight: 10, met: false },
    { id: 'x3', label: 'c', weight: 20, met: false },
  ];
  const r = releaseReadiness(checklist);
  assert.equal(r.achievedWeight, 10);
  assert.equal(r.totalWeight, 40);
  assert.equal(r.percent, 25);
  assert.equal(r.blockers.length, 2);
  assert.deepEqual(
    r.blockers.map((b) => b.id),
    ['x2', 'x3'],
  );
  assert.match(r.formula, /weight/);
  assert.equal(r.detail, '10 / 40 × 100 = 25%');
});

test('releaseReadiness guards against zero total weight', () => {
  const r = releaseReadiness([]);
  assert.equal(r.percent, 0);
  assert.equal(r.totalWeight, 0);
});

test('storyboardProgress computes stage percent and remaining', () => {
  const s = storyboardProgress({ currentStage: 24, stages: 30 });
  assert.equal(s.currentStage, 24);
  assert.equal(s.stages, 30);
  assert.equal(s.percent, 80);
  assert.equal(s.remaining, 6);
});

test('mergeLiveTasks reflects queue, current-work and active branch evidence', () => {
  const tasks = mergeLiveTasks(
    [{ id: 'roadmap', title: 'Roadmap', status: 'planned' }],
    [{ id: 'LB-DS-006', status: 'accepted' }],
    [{ title: 'Native identity', note: 'not started' }],
    { branch: 'chore/live-project-dashboard', status: { dirty: true } },
    [],
  );
  assert.equal(tasks.find((task) => task.id === 'LB-DS-006').status, 'accepted');
  assert.equal(tasks.find((task) => task.id === 'CURRENT-BRANCH').status, 'in-progress');
  assert.equal(tasks.find((task) => task.id === 'CURRENT-WORK-1').status, 'not-started');
});

test('mergeLiveTasks promotes a branch with a Draft PR to review-requested', () => {
  const tasks = mergeLiveTasks([], [], [], { branch: 'feature/x', status: { dirty: false } }, [
    { branch: 'feature/x', isDraft: true, number: 101 },
  ]);
  const current = tasks.find((task) => task.id === 'CURRENT-BRANCH');
  assert.equal(current.status, 'review-requested');
  assert.match(current.note, /#101/);
});

test('mergeLiveTasks exposes an open PR from another worktree as current work', () => {
  const tasks = mergeLiveTasks(
    [{ id: 'roadmap', title: 'Roadmap', status: 'in-progress' }],
    [],
    [],
    { branch: 'main', status: { dirty: false } },
    [
      {
        branch: 'docs/native-design',
        isDraft: true,
        number: 97,
        title: 'Native design',
        url: 'https://example/97',
      },
    ],
  );
  const activePr = tasks.find((task) => task.id === 'OPEN-PR-97');
  assert.equal(activePr.status, 'review-requested');
  assert.equal(activePr.title, 'PR #97 — Native design');
  assert.match(activePr.note, /docs\/native-design/);
});
