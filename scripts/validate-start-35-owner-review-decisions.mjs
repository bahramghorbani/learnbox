import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { format, resolveConfig } from 'prettier';

export const ownerReviewDecisionRecordPath =
  'content/packs/learnbox-start/validation/start-a1-35-owner-review-decisions.json';
const humanReviewPacketPath =
  'content/packs/learnbox-start/validation/start-a1-35-human-review-packet.json';
const sourcePacketTaskId = 'LB-DS-076';
const decisionTaskId = 'LB-DS-077';
const sourceBatchId = 'learnbox-start-a1-35-human-review-packet-v1';
const sourceMergeCommit = 'f0f413bca32317e0bca25e55c54e950a37a95830';
const recordId = 'learnbox-start-a1-35-owner-review-decisions-v1';
const recordKind = 'repository_owner_review_decision_record';
const recordState = 'owner_decisions_recorded_repository_evidence_only';
const reviewerRole = 'owner';
const evidenceScope = 'repository_owner_evidence_only';
const seedDecision = 'blocked_until_admin_persistence_attachment_and_owner_release_gate';
const isoInstant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// The canonical dimension and decision vocabulary is the migration enum and the
// Admin review store, never this record's own wording.
const reviewDimensionIds = [
  'german_linguistic',
  'persian_translation',
  'provenance',
  'visual',
  'audio',
  'app_flow',
];
const checkOutcomeIds = ['passed', 'failed'];
const reviewDecisionIds = ['approve', 'reject', 'return_for_revision'];

const recordKeys = [
  'recordId',
  'recordKind',
  'state',
  'sourceBatchId',
  'sourceMergeCommit',
  'reviewerRole',
  'reviewedAt',
  'evidenceScope',
  'reviewDimensions',
  'decisionVocabulary',
  'checkOutcomeVocabulary',
  'reviewScope',
  'outcomeCounts',
  'decisionCounts',
  'releasePosition',
  'transparencyLimits',
  'adminPersistencePerformed',
  'databaseMutationPerformed',
  'attachmentPerformed',
  'attachmentAllowed',
  'seedable',
  'learnerExposure',
  'runtimeActivationPerformed',
  'providerCallPerformed',
  'publicationBlocked',
  'publicationApproved',
  'items',
];
const reviewScopeKeys = [
  'itemCount',
  'dimensionCount',
  'itemDimensionPairs',
  'originalItemCount',
  'finalItemCount',
];
const outcomeCountKeys = ['passed', 'failed'];
const decisionCountKeys = ['approve', 'reject', 'return_for_revision'];
const releasePositionKeys = [
  'ownerApprovedItemCount',
  'adminReviewOutcomesRecorded',
  'adminReviewOutcomesPending',
  'releaseApprovedItemCount',
  'seedDecision',
];
const transparencyLimitKeys = [
  'decisionOrigin',
  'adminReviewStoreRead',
  'databaseRowsVerified',
  'mediaAttached',
  'contentTruthIndependentlyVerified',
];
const itemKeys = ['contentId', 'order', 'checks', 'decision', 'decisionNote'];
const checkKeys = ['outcome'];

// A recorded owner decision must never carry a locator, provider identity,
// credential, receipt or media digest into Git.
const forbiddenKeyPattern =
  /(?:url|uri|href|locator|path|file|filename|provider|credential|secret|token|apikey|receipt|digest|sha256|sha1|md5|checksum|hash|bytes|size|objectid|attachmentid|uploadid|databaserowid|seedid|flag)/i;
const allowedForbiddenLookingKeys = new Set(['providerCallPerformed']);
const forbiddenValuePatterns = [
  [/https?:\/\//, 'a remote URL; only repository-local evidence is allowed'],
  [/\b[0-9a-f]{32,}\b/i, 'a digest-like hash'],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, 'a runtime row identifier'],
];
// The one allowed 40-hex value: the source merge commit itself, which is checked
// for equality against the work queue before this guard runs.
const allowedForbiddenValues = new Set([sourceMergeCommit]);

const enumerated = (text) => [...text.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
const sameOrdered = (left, right) =>
  Array.isArray(left) && left.length === right.length && left.every((v, i) => v === right[i]);
const sameSet = (left, right) =>
  left.length === right.length &&
  [...left].sort().every((value, index) => value === [...right].sort()[index]);
const pick = (source, keys) => Object.fromEntries(keys.map((key) => [key, source?.[key]]));

function assertExactKeys(value, expected, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  const actual = Object.keys(value);
  if (actual.length !== expected.length || !sameSet(actual, expected)) {
    throw new Error(
      `${label} must carry exactly these keys and no others: ${expected.join(', ')}.`,
    );
  }
}

function guardForbidden(record) {
  const guard = (value, trail) => {
    if (typeof value === 'string') {
      if (allowedForbiddenValues.has(value)) return;
      for (const [pattern, description] of forbiddenValuePatterns) {
        if (pattern.test(value)) throw new Error(`${trail} must not contain ${description}.`);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) => guard(entry, `${trail}[${index}]`));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, entry] of Object.entries(value)) {
        if (forbiddenKeyPattern.test(key) && !allowedForbiddenLookingKeys.has(key)) {
          throw new Error(`${trail}.${key} is a forbidden locator, provider or secret field.`);
        }
        guard(entry, `${trail}.${key}`);
      }
    }
  };
  guard(record, 'record');
}

// Canonical serialization: fixed key order, items sorted by their deterministic
// order field and each item's checks in canonical dimension order.
export function normalizeStart35OwnerReviewDecisions(record) {
  const items = [...(record?.items ?? [])].sort(
    (left, right) => (left?.order ?? 0) - (right?.order ?? 0),
  );
  return {
    recordId: record?.recordId,
    recordKind: record?.recordKind,
    state: record?.state,
    sourceBatchId: record?.sourceBatchId,
    sourceMergeCommit: record?.sourceMergeCommit,
    reviewerRole: record?.reviewerRole,
    reviewedAt: record?.reviewedAt,
    evidenceScope: record?.evidenceScope,
    reviewDimensions: [...(record?.reviewDimensions ?? [])],
    decisionVocabulary: [...(record?.decisionVocabulary ?? [])],
    checkOutcomeVocabulary: [...(record?.checkOutcomeVocabulary ?? [])],
    reviewScope: pick(record?.reviewScope, reviewScopeKeys),
    outcomeCounts: pick(record?.outcomeCounts, outcomeCountKeys),
    decisionCounts: pick(record?.decisionCounts, decisionCountKeys),
    releasePosition: pick(record?.releasePosition, releasePositionKeys),
    transparencyLimits: pick(record?.transparencyLimits, transparencyLimitKeys),
    adminPersistencePerformed: record?.adminPersistencePerformed,
    databaseMutationPerformed: record?.databaseMutationPerformed,
    attachmentPerformed: record?.attachmentPerformed,
    attachmentAllowed: record?.attachmentAllowed,
    seedable: record?.seedable,
    learnerExposure: record?.learnerExposure,
    runtimeActivationPerformed: record?.runtimeActivationPerformed,
    providerCallPerformed: record?.providerCallPerformed,
    publicationBlocked: record?.publicationBlocked,
    publicationApproved: record?.publicationApproved,
    items: items.map((entry) => ({
      contentId: entry?.contentId,
      order: entry?.order,
      checks: Object.fromEntries(
        reviewDimensionIds.map((dimension) => [
          dimension,
          { outcome: entry?.checks?.[dimension]?.outcome },
        ]),
      ),
      decision: entry?.decision,
      decisionNote: entry?.decisionNote,
    })),
  };
}

async function loadCanonicalVocabulary(root) {
  const [migration, store] = await Promise.all([
    readFile(resolve(root, 'database/migrations/0006_content_review_quality_gates.sql'), 'utf8'),
    readFile(resolve(root, 'apps/admin/lib/server/postgres-content-review-store.ts'), 'utf8'),
  ]);
  const dimensionEnum = migration.match(
    /CREATE TYPE content_review_dimension AS ENUM \(([\s\S]*?)\);/,
  );
  const outcomeEnum = migration.match(/CREATE TYPE content_review_outcome AS ENUM \(([^)]*)\);/);
  const adminDimensions = store.match(
    /export const contentReviewDimensions = \[([\s\S]*?)\] as const;/,
  );
  const adminActions = store.match(/export type ContentReviewAction = ([^;]+);/);
  if (!dimensionEnum || !outcomeEnum || !adminDimensions || !adminActions) {
    throw new Error('The canonical review dimension, outcome or decision vocabulary is missing.');
  }
  return {
    dimensions: enumerated(dimensionEnum[1]),
    outcomes: enumerated(outcomeEnum[1]).filter((id) => id !== 'pending'),
    adminDimensions: enumerated(adminDimensions[1]),
    reviewDecisions: enumerated(adminActions[1]),
  };
}

async function loadSourceMergeTruth(root) {
  const queue = await readFile(resolve(root, '.ai', 'WORK_QUEUE.md'), 'utf8');
  const block = (taskId) => {
    const start = queue.indexOf(`## ${taskId}`);
    if (start === -1) throw new Error(`${taskId} is missing from the work queue.`);
    const next = queue.indexOf('\n## LB-DS-', start + 4);
    return queue.slice(start, next === -1 ? queue.length : next);
  };
  const packetBlock = block(sourcePacketTaskId);
  const mergeCommit = packetBlock.match(/- Merge commit: `([0-9a-f]{40})`/)?.[1];
  const mergedAt = packetBlock.match(
    /merged at `[0-9a-f]{40}` on (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/,
  )?.[1];
  const base = block(decisionTaskId).match(/- Base: exact `([0-9a-f]{40})`/)?.[1];
  if (!mergeCommit || !mergedAt || !base) {
    throw new Error('The recorded source-merge evidence for the owner-decision record is missing.');
  }
  if (base !== mergeCommit) {
    throw new Error('The owner-decision task base must be the exact merged review-packet commit.');
  }
  return { mergeCommit, mergedAt };
}

export async function loadStart35OwnerReviewDecisionsSources(root = process.cwd()) {
  const [packet, vocabulary, mergeTruth] = await Promise.all([
    readFile(resolve(root, humanReviewPacketPath), 'utf8').then(JSON.parse),
    loadCanonicalVocabulary(root),
    loadSourceMergeTruth(root),
  ]);
  return {
    packet,
    vocabulary,
    sourceMergeCommit: mergeTruth.mergeCommit,
    sourceMergedAt: mergeTruth.mergedAt,
    reviewDimensionIds: vocabulary.dimensions,
  };
}

export async function assertStart35OwnerReviewDecisions(record, sources) {
  assertExactKeys(record, recordKeys, 'the owner-decision record');

  if (
    record.recordId !== recordId ||
    record.recordKind !== recordKind ||
    record.state !== recordState
  ) {
    throw new Error(
      'The owner-decision record must identify itself as the repository owner-decision record for this task.',
    );
  }
  if (
    record.sourceBatchId !== sourceBatchId ||
    sources.packet.batchId !== sourceBatchId ||
    record.sourceMergeCommit !== sourceMergeCommit ||
    record.sourceMergeCommit !== sources.sourceMergeCommit
  ) {
    throw new Error(
      'The owner-decision record must bind the exact merged 35-item review-packet batch and commit.',
    );
  }
  if (record.reviewerRole !== reviewerRole) {
    throw new Error(`The owner-decision record reviewer role must be ${reviewerRole}.`);
  }
  const reviewedAt = Date.parse(record.reviewedAt);
  if (
    typeof record.reviewedAt !== 'string' ||
    !isoInstant.test(record.reviewedAt) ||
    Number.isNaN(reviewedAt)
  ) {
    throw new Error('The owner-decision record reviewedAt must be a valid UTC ISO-8601 instant.');
  }
  if (reviewedAt <= Date.parse(sources.sourceMergedAt)) {
    throw new Error(
      'The owner-decision record review time must follow the merged review-packet source.',
    );
  }

  guardForbidden(record);

  const vocabulary = sources.vocabulary;
  if (
    !sameOrdered(record.reviewDimensions, reviewDimensionIds) ||
    !sameOrdered(record.reviewDimensions, vocabulary.dimensions) ||
    !sameOrdered(vocabulary.adminDimensions, vocabulary.dimensions) ||
    !sameOrdered(record.reviewDimensions, sources.packet.reviewDimensions)
  ) {
    throw new Error(
      'The owner-decision record must carry exactly the six canonical review dimensions in canonical order.',
    );
  }
  if (
    !sameOrdered(record.decisionVocabulary, reviewDecisionIds) ||
    !sameSet(record.decisionVocabulary, vocabulary.reviewDecisions) ||
    !sameOrdered(record.checkOutcomeVocabulary, checkOutcomeIds) ||
    !sameSet(record.checkOutcomeVocabulary, vocabulary.outcomes)
  ) {
    throw new Error(
      'The owner-decision record must restate the canonical approve/reject/return_for_revision decisions and passed/failed outcomes.',
    );
  }
  if (record.evidenceScope !== evidenceScope) {
    throw new Error(
      `The owner-decision record must state ${evidenceScope}; it never proves persisted or released state.`,
    );
  }

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
    if (record[key] !== false) {
      throw new Error(`The owner-decision record must state ${key}=false.`);
    }
  }
  if (record.publicationBlocked !== true) {
    throw new Error('The owner-decision record must keep publicationBlocked=true.');
  }

  assertExactKeys(record.transparencyLimits, transparencyLimitKeys, 'transparencyLimits');
  const expectedLimits = {
    decisionOrigin: 'owner_submitted_batch_review',
    adminReviewStoreRead: false,
    databaseRowsVerified: false,
    mediaAttached: false,
    contentTruthIndependentlyVerified: false,
  };
  for (const [key, expected] of Object.entries(expectedLimits)) {
    if (record.transparencyLimits[key] !== expected) {
      throw new Error(`transparencyLimits.${key} must be ${expected}.`);
    }
  }

  assertExactKeys(record.reviewScope, reviewScopeKeys, 'reviewScope');
  if (
    record.reviewScope.itemCount !== sources.packet.reviewScope.itemCount ||
    record.reviewScope.dimensionCount !== sources.packet.reviewScope.dimensionCount ||
    record.reviewScope.itemDimensionPairs !== sources.packet.reviewScope.itemDimensionPairs ||
    record.reviewScope.originalItemCount !== sources.packet.reviewScope.originalItemCount ||
    record.reviewScope.finalItemCount !== sources.packet.reviewScope.finalItemCount ||
    !sameOrdered(Object.values(record.reviewScope), [35, 6, 210, 20, 15])
  ) {
    throw new Error(
      'The owner-decision record scope must stay 35 items, six dimensions and 210 pairs exactly as the merged packet states them.',
    );
  }

  if (!Array.isArray(record.items) || record.items.length !== sources.packet.items.length) {
    throw new Error('The owner-decision record must contain exactly the 35 canonical items.');
  }
  const seen = new Set();
  for (const [index, entry] of record.items.entries()) {
    const label = `item ${entry?.contentId ?? index}`;
    assertExactKeys(entry, itemKeys, label);
    const sourceItem = sources.packet.items[index];
    if (
      entry.contentId !== sourceItem.contentId ||
      entry.order !== sourceItem.order ||
      entry.order !== index + 1 ||
      seen.has(entry.contentId)
    ) {
      throw new Error(
        `${label} must repeat the merged packet item IDs in their exact deterministic order.`,
      );
    }
    seen.add(entry.contentId);
    assertExactKeys(entry.checks, reviewDimensionIds, `${label} checks`);
    if (!sameOrdered(Object.keys(entry.checks), record.reviewDimensions)) {
      throw new Error(`${label} dimension ordering must stay deterministic.`);
    }
    for (const dimension of reviewDimensionIds) {
      assertExactKeys(entry.checks[dimension], checkKeys, `${label} ${dimension}`);
      if (entry.checks[dimension].outcome !== 'passed') {
        throw new Error(
          `${label} ${dimension} must record the owner's passed outcome, not ${entry.checks[dimension].outcome}.`,
        );
      }
    }
    if (entry.decision !== 'approve') {
      throw new Error(`${label} must record the owner's approve decision.`);
    }
    if (entry.decisionNote !== null) {
      throw new Error(`${label} must not carry an anomalous decision note.`);
    }
  }

  assertExactKeys(record.outcomeCounts, outcomeCountKeys, 'outcomeCounts');
  assertExactKeys(record.decisionCounts, decisionCountKeys, 'decisionCounts');
  const outcomes = record.items.flatMap((entry) =>
    reviewDimensionIds.map((dimension) => entry.checks[dimension].outcome),
  );
  const countBy = (values) =>
    values.reduce((counts, value) => {
      counts[value] = (counts[value] ?? 0) + 1;
      return counts;
    }, {});
  const outcomeTotals = countBy(outcomes);
  const decisionTotals = countBy(record.items.map((entry) => entry.decision));
  if (
    outcomes.length !== 210 ||
    outcomeTotals.passed !== 210 ||
    (outcomeTotals.failed ?? 0) !== 0 ||
    record.outcomeCounts.passed !== 210 ||
    record.outcomeCounts.failed !== 0
  ) {
    throw new Error(
      'The owner-decision record must contain exactly 210 passed and no failed checks.',
    );
  }
  if (
    decisionTotals.approve !== 35 ||
    (decisionTotals.reject ?? 0) !== 0 ||
    (decisionTotals.return_for_revision ?? 0) !== 0 ||
    record.decisionCounts.approve !== 35 ||
    record.decisionCounts.reject !== 0 ||
    record.decisionCounts.return_for_revision !== 0
  ) {
    throw new Error(
      'The owner-decision record must contain exactly 35 approve decisions and no reject or return_for_revision decisions.',
    );
  }

  assertExactKeys(record.releasePosition, releasePositionKeys, 'releasePosition');
  for (const [key, expected] of Object.entries({
    ownerApprovedItemCount: 35,
    adminReviewOutcomesRecorded: 0,
    adminReviewOutcomesPending: 210,
    releaseApprovedItemCount: 0,
    seedDecision,
  })) {
    if (record.releasePosition[key] !== expected) {
      throw new Error(
        `releasePosition.${key} must be ${expected}; a recorded repository decision is not persisted or released state.`,
      );
    }
  }

  if (
    sources.packet.reviewDecisionRecorded !== false ||
    sources.packet.state !== 'prepared_awaiting_owner_review' ||
    sources.packet.items.some((entry) => entry.decision?.recorded !== null)
  ) {
    throw new Error('The reviewed packet must stay decision-free; owner decisions live only here.');
  }

  return record;
}

export async function validateStart35OwnerReviewDecisions(root = process.cwd()) {
  const relativePath = ownerReviewDecisionRecordPath;
  const absolutePath = resolve(root, relativePath);
  const [committedSource, sources] = await Promise.all([
    readFile(absolutePath, 'utf8'),
    loadStart35OwnerReviewDecisionsSources(root),
  ]);
  const record = JSON.parse(committedSource);
  await assertStart35OwnerReviewDecisions(record, sources);
  const canonical = await format(JSON.stringify(normalizeStart35OwnerReviewDecisions(record)), {
    ...(await resolveConfig(absolutePath)),
    filepath: absolutePath,
  });
  if (committedSource !== canonical) {
    throw new Error(
      'The committed owner-decision record must be its deterministic canonical serialization.',
    );
  }
  console.info('START_35_OWNER_REVIEW_DECISIONS_OK items=35 dimensions=6 passed=210 approve=35');
  return record;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await validateStart35OwnerReviewDecisions();
}
