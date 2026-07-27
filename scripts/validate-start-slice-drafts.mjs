import { readFile } from 'node:fs/promises';

const base = new URL('../content/packs/learnbox-start/', import.meta.url);
const [candidatesRaw, draftsRaw] = await Promise.all([
  readFile(new URL('validation/start-a1-slice-candidates.json', base), 'utf8'),
  readFile(new URL('vocabulary/start-a1-vertical-slice-drafts.json', base), 'utf8'),
]);
const candidates = JSON.parse(candidatesRaw);
const drafts = JSON.parse(draftsRaw);
const fail = (message) => {
  throw new Error(`Invalid Start slice drafts: ${message}`);
};

if (drafts.status !== 'needs_editorial_review') fail('editorial-review gate is required');
if (!Array.isArray(drafts.items) || drafts.items.length !== 20)
  fail('exactly 20 drafts are required');
const candidateIds = new Set(candidates.candidates.map((candidate) => candidate.candidateId));
const draftIds = new Set();
for (const item of drafts.items) {
  if (!candidateIds.has(item.id) || draftIds.has(item.id))
    fail('draft IDs must match unique candidates');
  draftIds.add(item.id);
  for (const field of [
    'lemma',
    'normalizedLemma',
    'simpleGermanDefinition',
    'essentialInflection',
    'grammarNote',
    'visualConcept',
    'imagePrompt',
  ]) {
    if (!item[field]?.trim()) fail(`${field} is required for ${item.id}`);
  }
  if (item.status !== 'needs_review' || item.source?.provider !== 'ai_suggestion') {
    fail(`draft ${item.id} must remain in the editorial queue`);
  }
  if (!Array.isArray(item.persianMeanings) || !item.persianMeanings.length) {
    fail(`Persian meaning is required for ${item.id}`);
  }
  if (!Array.isArray(item.examples) || item.examples.length < 1) {
    fail(`German and Persian example is required for ${item.id}`);
  }
  if (!Array.isArray(item.media) || item.media.length !== 0 || item.mediaQa) {
    fail(`draft ${item.id} cannot claim production media or media QA`);
  }
}
if (draftIds.size !== candidateIds.size) fail('every source candidate must have one draft');

console.log('Start slice drafts are complete, source-linked and editorial-review-gated.');
