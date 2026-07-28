import { readFile } from 'node:fs/promises';

const contentRoot = new URL('../content/packs/learnbox-start/', import.meta.url);
const drafts = JSON.parse(
  await readFile(new URL('vocabulary/start-a1-vertical-slice-drafts.json', contentRoot), 'utf8'),
);
const verification = JSON.parse(
  await readFile(
    new URL('validation/start-a1-slice-source-scope-verification.json', contentRoot),
    'utf8',
  ),
);

const verifiedItemIds = new Set(verification.scopeSupportedItemIds);

if (verification.batchId !== drafts.batchId) {
  throw new Error('Source-scope verification must reference the draft batch.');
}

if (verification.verificationType !== 'official_a1_lexical_scope') {
  throw new Error('Source-scope verification must remain limited to official A1 lexical scope.');
}

if (!verification.source.url.startsWith('https://www.goethe.de/')) {
  throw new Error('Source-scope verification must cite the official Goethe source.');
}

if (
  verifiedItemIds.size !== drafts.items.length ||
  !drafts.items.every((item) => verifiedItemIds.has(item.id))
) {
  throw new Error('Source-scope verification must cover every Start draft exactly once.');
}

if (!verification.limitations.some((item) => item.includes('Visual QA'))) {
  throw new Error('Source-scope verification must not bypass remaining quality gates.');
}

console.info('Start A1 source-scope verification is valid and remains publication-blocked.');
