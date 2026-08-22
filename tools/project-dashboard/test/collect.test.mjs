import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGitStatus,
  parseGitLog,
  parseGhPrList,
  parseWorkQueue,
  parseCurrentWork,
  parseStoryboard,
} from '../collect.mjs';

test('parseGitStatus extracts branch and changed-file count', () => {
  const out = [
    '## chore/live-project-dashboard...origin/main',
    ' M tools/project-dashboard/server.mjs',
    '?? tools/project-dashboard/README.md',
  ].join('\n');
  const s = parseGitStatus(out);
  assert.equal(s.branch, 'chore/live-project-dashboard');
  assert.equal(s.changes, 2);
  assert.equal(s.dirty, true);
});

test('parseGitStatus handles clean tree', () => {
  const s = parseGitStatus('## main');
  assert.equal(s.branch, 'main');
  assert.equal(s.changes, 0);
  assert.equal(s.dirty, false);
});

test('parseGitLog returns commit subjects', () => {
  const out = [
    '3846d6a Merge pull request #95 from bahramghorbani/docs/close-lb-ds-006',
    '9de9cf2 docs(ai): close merged mobile web parity',
  ].join('\n');
  const log = parseGitLog(out);
  assert.equal(log.length, 2);
  assert.match(log[0], /Merge pull request #95/);
});

test('parseGhPrList returns [] for empty/offline output', () => {
  assert.deepEqual(parseGhPrList(''), []);
});

test('parseGhPrList parses structured GitHub JSON', () => {
  const out = JSON.stringify([
    {
      number: 99,
      title: 'Some PR',
      headRefName: 'some/branch',
      isDraft: true,
      url: 'https://example/99',
    },
  ]);
  const prs = parseGhPrList(out);
  assert.equal(prs.length, 1);
  assert.equal(prs[0].number, 99);
  assert.equal(prs[0].title, 'Some PR');
  assert.equal(prs[0].branch, 'some/branch');
  assert.equal(prs[0].isDraft, true);
});

test('parseGhPrList fails closed on malformed output', () => {
  assert.deepEqual(parseGhPrList('not-json'), []);
});

test('parseWorkQueue finds LB-DS tasks and their statuses', () => {
  const text = [
    '## LB-DS-006',
    '- Status: accepted',
    'irrelevant body',
    '## LB-DS-002',
    '- Status: accepted',
  ].join('\n');
  const tasks = parseWorkQueue(text);
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].id, 'LB-DS-006');
  assert.equal(tasks[0].status, 'accepted');
});

test('parseCurrentWork returns only explicit unfinished bullets', () => {
  const text = [
    '### Not done (open for the other agent)',
    '- **Native identity + authenticated transport** was not started.',
    '- **Issue #92** is a separate investigation.',
    '',
    '## Known continuation gate',
    '- **Historical item** must not be included.',
  ].join('\n');
  assert.deepEqual(parseCurrentWork(text), [
    { title: 'Native identity + authenticated transport', note: 'was not started.' },
    { title: 'Issue #92', note: 'is a separate investigation.' },
  ]);
});

test('parseStoryboard extracts current stage of total', () => {
  const out = parseStoryboard('**Current stage:** 24 of 30 — Beta and load testing');
  assert.deepEqual(out, { currentStage: 24, stages: 30 });
});

test('parseStoryboard returns null when stage line is absent', () => {
  assert.equal(parseStoryboard('no stage here'), null);
});
