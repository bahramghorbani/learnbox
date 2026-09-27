import { readFile } from 'node:fs/promises';

const base = new URL('../content/packs/learnbox-start/', import.meta.url);
const [sliceRaw, pendingRaw, approvalRaw] = await Promise.all([
  readFile(new URL('validation/start-a1-slice-candidates.json', base), 'utf8'),
  readFile(new URL('validation/start-a1-catalog-35-pending-candidates.json', base), 'utf8'),
  readFile(new URL('validation/start-a1-slice-linguistic-approval.json', base), 'utf8'),
]);
const intakes = [JSON.parse(sliceRaw), JSON.parse(pendingRaw)];
const approval = JSON.parse(approvalRaw);
const fail = (message) => {
  throw new Error(`Invalid Start candidate intake: ${message}`);
};
const expectedDimensions = 'german_linguistic,persian_translation';
const expectedBatches = new Map([
  [
    'learnbox-start-a1-vertical-slice-candidates-v1',
    { draftBatchId: 'learnbox-start-a1-vertical-slice-drafts-v1', count: 20 },
  ],
  [
    'learnbox-start-a1-catalog-35-pending-candidates-v1',
    { draftBatchId: 'learnbox-start-a1-catalog-35-pending-drafts-v1', count: 15 },
  ],
]);
const events = new Map(approval.approvalEvents.map((event) => [event.batchId, event]));
const ids = new Set();
const lemmas = new Set();

for (const intake of intakes) {
  const expected = expectedBatches.get(intake.batchId);
  if (!expected) fail(`unexpected batch ${intake.batchId}.`);
  if (intake.status !== 'source_referenced_linguistic_review_recorded') {
    fail(`${intake.batchId} must record completed linguistic dimensions without implying release.`);
  }
  if (!intake.source?.url?.startsWith('https://')) fail('HTTPS source reference is required.');
  if (!Array.isArray(intake.candidates) || intake.candidates.length !== expected.count) {
    fail(`${intake.batchId} must contain exactly ${expected.count} candidates.`);
  }

  const event = events.get(expected.draftBatchId);
  const recorded = intake.linguisticApproval;
  if (
    !event ||
    recorded?.approvalReference !== event.approvalReference ||
    recorded?.approvedAt !== event.approvedAt ||
    recorded?.approvedByRole !== event.approvedByRole ||
    recorded?.approvedDimensions?.join(',') !== expectedDimensions
  ) {
    fail(`${intake.batchId} linguistic approval must match the canonical approval ledger.`);
  }
  const eventIds = new Set(event.itemIds);

  for (const candidate of intake.candidates) {
    if (!candidate.candidateId || ids.has(candidate.candidateId)) {
      fail('candidate IDs must be unique across both batches.');
    }
    ids.add(candidate.candidateId);
    const lemma = candidate.lemmaHint?.trim().toLocaleLowerCase('de-DE').replaceAll(/\s+/g, ' ');
    if (!lemma || lemmas.has(lemma)) fail('candidate lemmas must be unique across both batches.');
    lemmas.add(lemma);
    if (!candidate.selectionRationale?.trim()) fail('selection rationale is required.');
    if (candidate.sourceEntryVerification !== 'linguistic_review_recorded') {
      fail(`${candidate.candidateId} must record linguistic review without implying release.`);
    }
    if (!eventIds.has(candidate.candidateId)) {
      fail(`${candidate.candidateId} is absent from its canonical linguistic approval event.`);
    }
  }
}

if (ids.size !== 35) fail('the two candidate intakes must contain 35 unique items.');
const requiredSliceCategories = new Set([
  'household_noun',
  'food_drink',
  'place',
  'verb',
  'adjective_emotion',
  'daily_expression',
]);
for (const candidate of intakes[0].candidates) requiredSliceCategories.delete(candidate.category);
if (requiredSliceCategories.size) {
  fail(`original slice is missing category: ${[...requiredSliceCategories].join(', ')}.`);
}

console.log(
  'Start candidate intakes are valid: 35 source-linked items with scoped linguistic evidence.',
);
