import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { format, resolveConfig } from 'prettier';

import {
  assertStart35OwnerReviewDecisions,
  loadStart35OwnerReviewDecisionsSources,
  normalizeStart35OwnerReviewDecisions,
  ownerReviewDecisionRecordPath,
} from './validate-start-35-owner-review-decisions.mjs';

const recordUrl = new URL(
  '../content/packs/learnbox-start/validation/start-a1-35-owner-review-decisions.json',
  import.meta.url,
);
const repositoryRoot = new URL('..', import.meta.url).pathname;
const committedSource = await readFile(recordUrl, 'utf8');
const committed = JSON.parse(committedSource);
const sources = await loadStart35OwnerReviewDecisionsSources(repositoryRoot);
const formatterOptions = {
  ...(await resolveConfig(recordUrl.pathname)),
  filepath: recordUrl.pathname,
};
const clone = () => structuredClone(committed);
const rejects = (mutate) => {
  const record = clone();
  mutate(record);
  return assert.rejects(() => assertStart35OwnerReviewDecisions(record, sources));
};
const item = (record, contentId) => record.items.find((entry) => entry.contentId === contentId);
const derivedOutcomes = (record) => record.items.flatMap((entry) => Object.values(entry.checks));
const countBy = (values, key) =>
  values.reduce((counts, value) => {
    counts[value[key]] = (counts[value[key]] ?? 0) + 1;
    return counts;
  }, {});

test('the committed owner-decision record is canonical, deterministic and accepted', async () => {
  assert.equal(resolve(repositoryRoot, ownerReviewDecisionRecordPath), recordUrl.pathname);
  assert.deepEqual(committed, normalizeStart35OwnerReviewDecisions(committed));
  assert.equal(committedSource, await format(JSON.stringify(committed), formatterOptions));
  assert.deepEqual(
    normalizeStart35OwnerReviewDecisions({
      ...committed,
      items: [...committed.items].reverse(),
    }),
    normalizeStart35OwnerReviewDecisions(committed),
  );
  await assert.doesNotReject(() => assertStart35OwnerReviewDecisions(committed, sources));
});

test('the record binds the exact merged packet source and review time', async () => {
  assert.equal(committed.sourceBatchId, sources.packet.batchId);
  assert.equal(committed.sourceMergeCommit, sources.sourceMergeCommit);
  assert.equal(committed.reviewerRole, 'owner');
  assert.ok(Date.parse(committed.reviewedAt) > Date.parse(sources.sourceMergedAt));
});

test('the record restates 35 canonical items in packet order with six passed checks each', () => {
  assert.equal(committed.items.length, 35);
  assert.deepEqual(
    committed.items.map((entry) => [entry.contentId, entry.order]),
    sources.packet.items.map((entry) => [entry.contentId, entry.order]),
  );
  assert.equal(new Set(committed.items.map((entry) => entry.contentId)).size, 35);
  for (const entry of committed.items) {
    assert.deepEqual(Object.keys(entry.checks), committed.reviewDimensions);
  }
  assert.deepEqual(countBy(derivedOutcomes(committed), 'outcome'), {
    passed: 210,
  });
  assert.deepEqual(countBy(committed.items, 'decision'), { approve: 35 });
  assert.deepEqual(committed.outcomeCounts, { passed: 210, failed: 0 });
  assert.deepEqual(committed.decisionCounts, {
    approve: 35,
    reject: 0,
    return_for_revision: 0,
  });
  assert.deepEqual(committed.reviewDimensions, sources.reviewDimensionIds);
  assert.deepEqual(committed.reviewScope, {
    itemCount: 35,
    dimensionCount: 6,
    itemDimensionPairs: 210,
    originalItemCount: 20,
    finalItemCount: 15,
  });
});

test('the record claims repository owner evidence only and keeps every later gate closed', () => {
  assert.equal(committed.evidenceScope, 'repository_owner_evidence_only');
  for (const key of [
    'adminPersistencePerformed',
    'databaseMutationPerformed',
    'attachmentPerformed',
    'attachmentAllowed',
    'seedable',
    'learnerExposure',
    'runtimeActivationPerformed',
    'providerCallPerformed',
    'publicationApproved',
  ]) {
    assert.equal(committed[key], false, key);
  }
  assert.equal(committed.publicationBlocked, true);
  assert.deepEqual(committed.transparencyLimits, {
    decisionOrigin: 'owner_submitted_batch_review',
    adminReviewStoreRead: false,
    databaseRowsVerified: false,
    mediaAttached: false,
    contentTruthIndependentlyVerified: false,
  });
  assert.deepEqual(committed.releasePosition, {
    ownerApprovedItemCount: 35,
    adminReviewOutcomesRecorded: 0,
    adminReviewOutcomesPending: 210,
    releaseApprovedItemCount: 0,
    seedDecision: 'blocked_until_admin_persistence_attachment_and_owner_release_gate',
  });
});

test('the record adds no decision to the reviewed packet', () => {
  assert.equal(sources.packet.reviewDecisionRecorded, false);
  assert.equal(sources.packet.state, 'prepared_awaiting_owner_review');
  for (const entry of sources.packet.items) assert.equal(entry.decision.recorded, null);
});

const mutations = [
  ['a wrong source merge commit', (record) => (record.sourceMergeCommit = 'a'.repeat(40))],
  ['an extra top-level field', (record) => (record.reviewerEmail = 'owner@example.com')],
  ['a missing item', (record) => record.items.pop()],
  ['a duplicated item', (record) => record.items.splice(1, 1, record.items[0])],
  ['reordered items', (record) => record.items.reverse()],
  ['an altered item order field', (record) => (record.items[0].order = record.items[1].order)],
  [
    'an altered dimension ID',
    (record) => (item(record, 'start-a1-apfel').checks.wording = { outcome: 'passed' }),
  ],
  ['a missing dimension', (record) => delete item(record, 'start-a1-apfel').checks.app_flow],
  [
    'a failed check',
    (record) => (item(record, 'start-a1-bahnhof').checks.audio.outcome = 'failed'),
  ],
  ['a pending check', (record) => delete item(record, 'start-a1-bahnhof').checks.audio.outcome],
  [
    'a non-approve decision',
    (record) => (item(record, 'start-a1-apfel').decision = 'return_for_revision'),
  ],
  [
    'a decision note anomaly',
    (record) => (item(record, 'start-a1-apfel').decisionNote = 'see attachment'),
  ],
  ['altered outcome counts', (record) => (record.outcomeCounts.passed = 209)],
  ['an altered review scope', (record) => (record.reviewScope.itemDimensionPairs = 200)],
  ['an altered decision vocabulary', (record) => record.decisionVocabulary.pop()],
  ['an altered dimension list', (record) => record.reviewDimensions.reverse()],
  ['a future-only timestamp format', (record) => (record.reviewedAt = '2026-09-14 17:31')],
  [
    'a timestamp that precedes the source merge',
    (record) => (record.reviewedAt = '2026-09-14T16:46:50.000Z'),
  ],
  ['a claimed Admin persistence', (record) => (record.adminPersistencePerformed = true)],
  ['a claimed database mutation', (record) => (record.databaseMutationPerformed = true)],
  ['a claimed attachment', (record) => (record.attachmentPerformed = true)],
  ['an attachment allowance', (record) => (record.attachmentAllowed = true)],
  ['a seedable claim', (record) => (record.seedable = true)],
  ['a learner-exposure claim', (record) => (record.learnerExposure = true)],
  ['a claimed runtime activation', (record) => (record.runtimeActivationPerformed = true)],
  ['a claimed provider call', (record) => (record.providerCallPerformed = true)],
  ['a published claim', (record) => (record.publicationBlocked = false)],
  ['an approved-for-publication claim', (record) => (record.publicationApproved = true)],
  [
    'an inflated release position',
    (record) => (record.releasePosition.releaseApprovedItemCount = 35),
  ],
  ['a weakened evidence scope', (record) => (record.evidenceScope = 'release_approved')],
  [
    'a weakened transparency limit',
    (record) => (record.transparencyLimits.databaseRowsVerified = true),
  ],
  ['a URL field', (record) => (record.mediaUrl = 'local')],
  ['a provider credential field', (record) => (record.providerApiKey = 'redacted')],
  ['a receipt field', (record) => (record.uploadReceipt = 'opaque')],
  ['a digest field', (record) => (record.artifactSha256 = 'opaque')],
  ['a remote URL value', (record) => (record.state = 'https://example.com/record')],
  ['a digest-like value', (record) => (record.state = 'a'.repeat(40))],
  [
    'a runtime identifier value',
    (record) => (record.state = '11111111-2222-3333-4444-555555555555'),
  ],
  [
    'a forbidden field inside an item',
    (record) => (item(record, 'start-a1-apfel').storageUrl = 'local'),
  ],
];

for (const [label, mutate] of mutations) {
  test(`the record fails closed on ${label}`, async () => {
    await rejects(mutate);
  });
}
