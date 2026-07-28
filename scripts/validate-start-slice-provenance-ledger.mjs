import { readFile } from 'node:fs/promises';

const contentRoot = new URL('../content/packs/learnbox-start/', import.meta.url);
const drafts = JSON.parse(
  await readFile(new URL('vocabulary/start-a1-vertical-slice-drafts.json', contentRoot), 'utf8'),
);
const ledger = JSON.parse(
  await readFile(new URL('validation/start-a1-provenance-ledger.json', contentRoot), 'utf8'),
);

if (ledger.batchId !== drafts.batchId || ledger.releaseState !== 'documented_not_released') {
  throw new Error('The provenance ledger must be tied to the current unreleased Start batch.');
}

if (!ledger.lexicalScopeSource.url.startsWith('https://www.goethe.de/')) {
  throw new Error('The provenance ledger must cite the official Goethe source.');
}

const ledgerIds = new Set(ledger.items.map((item) => item.itemId));
if (
  ledgerIds.size !== drafts.items.length ||
  !drafts.items.every((item) => ledgerIds.has(item.id))
) {
  throw new Error('The provenance ledger must cover every Start item exactly once.');
}

if (!ledger.items.every((item) => item.evidencePages.length > 0)) {
  throw new Error('Every Start item needs at least one official-source evidence page.');
}

const formalCheckIn = ledger.items.find((item) => item.itemId === 'start-a1-wie-geht-es-ihnen');
if (formalCheckIn?.evidenceType !== 'scope_adaptation') {
  throw new Error(
    'The formal check-in phrase must remain accurately marked as an editorial adaptation.',
  );
}

if (
  ledger.candidateMedia.attachmentAllowed ||
  ledger.candidateMedia.publicationAllowed ||
  !ledger.remainingReleaseGates.includes('media_license_review')
) {
  throw new Error('Documented provenance must not bypass the candidate-media release gate.');
}

console.info('Start A1 provenance ledger is complete and remains release-gated.');
