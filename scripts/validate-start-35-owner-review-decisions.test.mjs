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
const countBy = (values, key) =>
  values.reduce((counts, value) => {
    counts[value[key]] = (counts[value[key]] ?? 0) + 1;
    return counts;
  }, {});

// Owner-review evidence basis per dimension: every dimension is an owner
// reading of the self-contained review artifact, and app flow is the owner's
// acceptance of that isolated artifact's card flow, never Production runtime
// behavior.
const ownerEvidenceBasisByDimension = {
  german_linguistic: 'owner_reviewed_review_artifact',
  persian_translation: 'owner_reviewed_review_artifact',
  provenance: 'owner_reviewed_review_artifact',
  visual: 'owner_reviewed_review_artifact',
  audio: 'owner_reviewed_review_artifact',
  app_flow: 'owner_accepted_isolated_review_artifact_card_flow',
};
const checkKeys = [
  'ownerSubmittedOutcome',
  'adminOutcomeRecorded',
  'ownerEvidenceBasis',
  'productionRuntimeVerified',
  'sourcePacketStatus',
  'sourcePacketEvidenceScope',
];

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

test('the record restates 35 canonical items in packet order with six owner-submitted checks each', () => {
  assert.equal(committed.items.length, 35);
  assert.deepEqual(
    committed.items.map((entry) => [entry.contentId, entry.order]),
    sources.packet.items.map((entry) => [entry.contentId, entry.order]),
  );
  assert.equal(new Set(committed.items.map((entry) => entry.contentId)).size, 35);
  for (const entry of committed.items) {
    assert.deepEqual(Object.keys(entry.checks), committed.reviewDimensions);
  }
  assert.deepEqual(
    countBy(
      committed.items.flatMap((entry) => Object.values(entry.checks)),
      'ownerSubmittedOutcome',
    ),
    {
      passed: 210,
    },
  );
  assert.deepEqual(countBy(committed.items, 'decision'), { approve: 35 });
  assert.deepEqual(committed.ownerSubmittedOutcomeCounts, { passed: 210, failed: 0 });
  assert.deepEqual(committed.ownerDecisionCounts, {
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

test('every check is explicit owner-submitted evidence, never a bare or Admin outcome', () => {
  for (const entry of committed.items) {
    for (const [dimension, check] of Object.entries(entry.checks)) {
      const label = `${entry.contentId} ${dimension}`;
      assert.deepEqual(Object.keys(check), checkKeys, label);
      assert.equal(check.ownerSubmittedOutcome, 'passed', label);
      assert.equal(check.adminOutcomeRecorded, false, label);
      assert.equal(check.ownerEvidenceBasis, ownerEvidenceBasisByDimension[dimension], label);
      assert.equal(check.productionRuntimeVerified, false, label);
      const sourceCheck = sources.packet.items[entry.order - 1].checks[dimension];
      assert.equal(check.sourcePacketStatus, sourceCheck.status, label);
      assert.equal(check.sourcePacketEvidenceScope, sourceCheck.evidenceScope, label);
    }
  }
  // No ambiguous bare outcome claim and no Admin/release outcome count survives.
  assert.equal(/"outcome"\s*:/.test(committedSource), false);
  assert.equal(/"outcomeCounts"\s*:/.test(committedSource), false);
  assert.equal(Object.hasOwn(committed, 'outcomeCounts'), false);
  for (const entry of committed.items) {
    for (const check of Object.values(entry.checks))
      assert.equal(Object.hasOwn(check, 'outcome'), false);
  }
});

test('the app-flow check states owner acceptance of the isolated review artifact, not Production runtime', () => {
  for (const entry of committed.items) {
    assert.equal(
      entry.checks.app_flow.ownerEvidenceBasis,
      'owner_accepted_isolated_review_artifact_card_flow',
    );
    assert.equal(entry.checks.app_flow.productionRuntimeVerified, false);
    assert.equal(entry.checks.app_flow.sourcePacketStatus, 'pending_unproven');
    assert.equal(entry.checks.app_flow.sourcePacketEvidenceScope, 'unproven_at_release_level');
  }
  assert.deepEqual(committed.reviewPresentation, {
    artifactKind: 'self_contained_offline_35_card_owner_review_artifact',
    presentationScope: 'content_and_card_flow_acceptance_only',
    productionRuntimeVerification: false,
    runtimeActivationVerification: false,
    adminReviewOutcomePersistence: false,
    liveDatabaseVerification: false,
  });
});

test('both prior transcription exceptions survive with their owner disposition and no Admin outcome', () => {
  assert.deepEqual(
    committed.priorEvidenceExceptions,
    sources.packet.knownExceptions.map((exception) => ({
      exceptionId: exception.exceptionId,
      itemId: exception.itemId,
      dimension: exception.dimension,
      kind: exception.kind,
      state: exception.state,
      detail: exception.detail,
      ownerDisposition: 'accepted_as_presented_unpersisted_to_admin',
      adminOutcomeRecorded: false,
      resolved: false,
    })),
  );
  assert.deepEqual(
    committed.priorEvidenceExceptions.map((exception) => exception.exceptionId),
    ['start-a1-essen-sentence', 'start-a1-gross-word'],
  );
  assert.deepEqual(
    committed.priorEvidenceExceptions.map((exception) => exception.itemId),
    sources.packet.unresolvedItemExceptions,
  );
});

test('the reviewer role is owner-asserted through the submitted artifact with no identity proof', () => {
  assert.equal(committed.reviewerRole, 'owner');
  assert.equal(committed.reviewerRoleBasis, 'owner_asserted_through_submitted_review_artifact');
  assert.equal(committed.reviewerIdentityIndependentlyVerified, false);
  assert.equal(committed.identityOrSessionProofClaimed, false);
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
    (record) =>
      (item(record, 'start-a1-apfel').checks.wording = item(record, 'start-a1-apfel').checks.audio),
  ],
  ['a missing dimension', (record) => delete item(record, 'start-a1-apfel').checks.app_flow],
  [
    'a failed check',
    (record) => (item(record, 'start-a1-bahnhof').checks.audio.ownerSubmittedOutcome = 'failed'),
  ],
  [
    'a pending check',
    (record) => delete item(record, 'start-a1-bahnhof').checks.audio.ownerSubmittedOutcome,
  ],
  [
    'a reintroduced ambiguous bare outcome field',
    (record) => (item(record, 'start-a1-apfel').checks.audio = { outcome: 'passed' }),
  ],
  [
    'a reintroduced bare outcome count field',
    (record) => (record.outcomeCounts = { passed: 210, failed: 0 }),
  ],
  [
    'a removed owner-submitted outcome count',
    (record) => delete record.ownerSubmittedOutcomeCounts,
  ],
  [
    'a non-approve decision',
    (record) => (item(record, 'start-a1-apfel').decision = 'return_for_revision'),
  ],
  [
    'a decision note anomaly',
    (record) => (item(record, 'start-a1-apfel').decisionNote = 'see attachment'),
  ],
  [
    'altered owner-submitted outcome counts',
    (record) => (record.ownerSubmittedOutcomeCounts.passed = 209),
  ],
  ['an altered review scope', (record) => (record.reviewScope.itemDimensionPairs = 200)],
  ['an altered decision vocabulary', (record) => record.decisionVocabulary.pop()],
  ['an altered dimension list', (record) => record.reviewDimensions.reverse()],
  ['a future-only timestamp format', (record) => (record.reviewedAt = '2026-09-14 17:31')],
  [
    'an impossible calendar timestamp',
    (record) => (record.reviewedAt = '2026-09-31T17:31:26.517Z'),
  ],
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
  [
    'a persisted Admin outcome claim inside a check',
    (record) => (item(record, 'start-a1-apfel').checks.visual.adminOutcomeRecorded = true),
  ],
  [
    'a persisted Admin outcome claim in the release position',
    (record) => (record.releasePosition.adminReviewOutcomesRecorded = 210),
  ],
  [
    'a cleared pending Admin outcome count',
    (record) => (record.releasePosition.adminReviewOutcomesPending = 0),
  ],
  [
    'an app-flow Production runtime overclaim',
    (record) => (item(record, 'start-a1-apfel').checks.app_flow.productionRuntimeVerified = true),
  ],
  [
    'an app-flow production-verified evidence basis',
    (record) =>
      (item(record, 'start-a1-apfel').checks.app_flow.ownerEvidenceBasis =
        'owner_verified_production_runtime_flow'),
  ],
  [
    'an app-flow source status overclaim',
    (record) => (item(record, 'start-a1-apfel').checks.app_flow.sourcePacketStatus = 'passed'),
  ],
  [
    'an app-flow release-level scope overclaim',
    (record) =>
      (item(record, 'start-a1-apfel').checks.app_flow.sourcePacketEvidenceScope =
        'verified_at_release_level'),
  ],
  [
    'a dropped source packet status',
    (record) => delete item(record, 'start-a1-bahnhof').checks.provenance.sourcePacketStatus,
  ],
  [
    'a dropped source packet evidence scope',
    (record) => delete item(record, 'start-a1-bahnhof').checks.provenance.sourcePacketEvidenceScope,
  ],
  [
    'a review artifact production-runtime verification claim',
    (record) => (record.reviewPresentation.productionRuntimeVerification = true),
  ],
  [
    'a review artifact runtime activation claim',
    (record) => (record.reviewPresentation.runtimeActivationVerification = true),
  ],
  [
    'a review artifact Admin persistence claim',
    (record) => (record.reviewPresentation.adminReviewOutcomePersistence = true),
  ],
  [
    'a review artifact live database verification claim',
    (record) => (record.reviewPresentation.liveDatabaseVerification = true),
  ],
  [
    'a weakened review presentation scope',
    (record) => (record.reviewPresentation.presentationScope = 'production_runtime_verified'),
  ],
  [
    'a weakened review artifact kind',
    (record) => (record.reviewPresentation.artifactKind = 'deployed_production_app'),
  ],
  ['a dropped prior transcription exception', (record) => record.priorEvidenceExceptions.pop()],
  [
    'a duplicated prior transcription exception',
    (record) => record.priorEvidenceExceptions.splice(1, 0, record.priorEvidenceExceptions[0]),
  ],
  [
    'an altered prior transcription exception kind',
    (record) => (record.priorEvidenceExceptions[0].kind = 'human_listening_resolved'),
  ],
  [
    'an altered prior transcription exception state',
    (record) => (record.priorEvidenceExceptions[1].state = 'resolved'),
  ],
  [
    'a reassigned prior transcription exception item',
    (record) => (record.priorEvidenceExceptions[0].itemId = 'start-a1-apfel'),
  ],
  [
    'an altered prior transcription exception detail',
    (record) => (record.priorEvidenceExceptions[0].detail = 'no discrepancy remains'),
  ],
  [
    'a prior transcription exception resolution overclaim',
    (record) => (record.priorEvidenceExceptions[0].resolved = true),
  ],
  [
    'a weakened prior transcription exception disposition',
    (record) =>
      (record.priorEvidenceExceptions[0].ownerDisposition = 'resolved_by_human_listening'),
  ],
  [
    'an Admin outcome claim on a prior transcription exception',
    (record) => (record.priorEvidenceExceptions[1].adminOutcomeRecorded = true),
  ],
  [
    'a reviewer identity proof overclaim',
    (record) => (record.reviewerIdentityIndependentlyVerified = true),
  ],
  [
    'a session or cryptographic identity proof overclaim',
    (record) => (record.identityOrSessionProofClaimed = true),
  ],
  [
    'a weakened reviewer role basis',
    (record) => (record.reviewerRoleBasis = 'owner_verified_by_external_receipt'),
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
