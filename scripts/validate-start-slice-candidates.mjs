import { readFile } from 'node:fs/promises';

const path = new URL(
  '../content/packs/learnbox-start/validation/start-a1-slice-candidates.json',
  import.meta.url,
);
const intake = JSON.parse(await readFile(path, 'utf8'));
const fail = (message) => {
  throw new Error(`Invalid Start slice candidate intake: ${message}`);
};
const requiredCategories = new Set([
  'household_noun',
  'food_drink',
  'place',
  'verb',
  'adjective_emotion',
  'daily_expression',
]);

if (intake.status !== 'source_referenced_pending_linguistic_review') {
  fail('candidate status must preserve the linguistic review gate');
}
if (!intake.source?.url?.startsWith('https://')) fail('HTTPS source reference is required');
if (!Array.isArray(intake.candidates) || intake.candidates.length !== 20) {
  fail('exactly 20 candidates are required');
}
const ids = new Set();
const lemmas = new Set();
for (const candidate of intake.candidates) {
  if (!candidate.candidateId || ids.has(candidate.candidateId))
    fail('candidate IDs must be unique');
  ids.add(candidate.candidateId);
  const lemma = candidate.lemmaHint?.trim().toLocaleLowerCase('de-DE').replaceAll(/\s+/g, ' ');
  if (!lemma || lemmas.has(lemma)) fail('candidate lemmas must be unique');
  lemmas.add(lemma);
  if (!candidate.selectionRationale?.trim()) fail('selection rationale is required');
  if (candidate.sourceEntryVerification !== 'pending_linguistic_review') {
    fail('candidate entries cannot skip linguistic review');
  }
  requiredCategories.delete(candidate.category);
}
if (requiredCategories.size) fail(`missing category: ${[...requiredCategories].join(', ')}`);

console.log('Start slice candidate intake is valid and remains review-gated.');
