import { readFile } from 'node:fs/promises';

const base = new URL('../content/packs/learnbox-start/', import.meta.url);
const paths = [
  [
    'validation/start-a1-slice-candidates.json',
    'vocabulary/start-a1-vertical-slice-drafts.json',
    20,
  ],
  [
    'validation/start-a1-catalog-35-pending-candidates.json',
    'vocabulary/start-a1-catalog-35-pending-drafts.json',
    15,
  ],
];
const approval = JSON.parse(
  await readFile(new URL('validation/start-a1-slice-linguistic-approval.json', base), 'utf8'),
);
const events = new Map(approval.approvalEvents.map((event) => [event.batchId, event]));
const fail = (message) => {
  throw new Error(`Invalid Start drafts: ${message}`);
};
const expectedDimensions = 'german_linguistic,persian_translation';
const expectedRemaining = 'app_flow,audio,owner_release_approval,provenance,visual';
const allIds = new Set();

for (const [candidatePath, draftPath, expectedCount] of paths) {
  const [candidates, drafts] = await Promise.all([
    readFile(new URL(candidatePath, base), 'utf8').then(JSON.parse),
    readFile(new URL(draftPath, base), 'utf8').then(JSON.parse),
  ]);
  if (drafts.status !== 'linguistic_review_recorded_remaining_gates_pending') {
    fail(`${drafts.batchId} must separate linguistic evidence from remaining release gates.`);
  }
  if (!Array.isArray(drafts.items) || drafts.items.length !== expectedCount) {
    fail(`${drafts.batchId} must contain exactly ${expectedCount} drafts.`);
  }
  if (drafts.remainingReviewDimensions?.toSorted().join(',') !== expectedRemaining) {
    fail(`${drafts.batchId} must preserve every non-linguistic and owner release gate.`);
  }
  const event = events.get(drafts.batchId);
  const recorded = drafts.linguisticApproval;
  if (
    !event ||
    recorded?.approvalReference !== event.approvalReference ||
    recorded?.approvedAt !== event.approvedAt ||
    recorded?.approvedByRole !== event.approvedByRole ||
    recorded?.approvedDimensions?.join(',') !== expectedDimensions
  ) {
    fail(`${drafts.batchId} linguistic approval must match the canonical approval ledger.`);
  }

  const candidateIds = new Set(candidates.candidates.map((candidate) => candidate.candidateId));
  const draftIds = new Set();
  for (const item of drafts.items) {
    if (!candidateIds.has(item.id) || draftIds.has(item.id) || allIds.has(item.id)) {
      fail('draft IDs must match unique candidates across both batches.');
    }
    draftIds.add(item.id);
    allIds.add(item.id);
    for (const field of [
      'lemma',
      'normalizedLemma',
      'simpleGermanDefinition',
      'essentialInflection',
      'grammarNote',
      'visualConcept',
      'imagePrompt',
    ]) {
      if (!item[field]?.trim()) fail(`${field} is required for ${item.id}.`);
    }
    if (item.status !== 'needs_review' || item.source?.provider !== 'ai_suggestion') {
      fail(`${item.id} must remain in the overall review queue.`);
    }
    if (!item.source.reference.includes('linguistic review recorded')) {
      fail(`${item.id} source evidence must not retain stale pre-approval wording.`);
    }
    if (!Array.isArray(item.persianMeanings) || !item.persianMeanings.length) {
      fail(`Persian meaning is required for ${item.id}.`);
    }
    if (!Array.isArray(item.examples) || item.examples.length < 1) {
      fail(`German and Persian example is required for ${item.id}.`);
    }
    if (!Array.isArray(item.media) || item.media.length !== 0 || item.mediaQa) {
      fail(`${item.id} cannot claim production media or media QA.`);
    }
  }
  if (draftIds.size !== candidateIds.size) fail('every source candidate must have one draft.');
}

if (allIds.size !== 35) fail('the two draft batches must contain 35 unique items.');
console.log('Start drafts are valid: 35 linguistically reviewed drafts remain release-gated.');
