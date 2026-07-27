import { readFile } from 'node:fs/promises';

const contentRoot = new URL('../content/packs/learnbox-start/', import.meta.url);
const drafts = JSON.parse(
  await readFile(new URL('vocabulary/start-a1-vertical-slice-drafts.json', contentRoot), 'utf8'),
);
const approval = JSON.parse(
  await readFile(
    new URL('validation/start-a1-slice-linguistic-approval.json', contentRoot),
    'utf8',
  ),
);

const expectedDimensions = 'german_linguistic,persian_translation';
const expectedRemaining = 'app_flow,audio,provenance,visual';
const approvedItemIds = new Set(approval.itemIds);

if (approval.batchId !== drafts.batchId) {
  throw new Error('Linguistic approval must reference the draft batch.');
}

if (approval.approvedByRole !== 'product_owner') {
  throw new Error('Linguistic approval must identify the product owner role.');
}

if (approval.approvedDimensions.join(',') !== expectedDimensions) {
  throw new Error('Approval may only cover German and Persian linguistic dimensions.');
}

if (
  approvedItemIds.size !== drafts.items.length ||
  !drafts.items.every((item) => approvedItemIds.has(item.id))
) {
  throw new Error('Linguistic approval must cover every item in the draft batch exactly once.');
}

if (!drafts.items.every((item) => item.status === 'needs_review')) {
  throw new Error('Linguistic approval must not change draft publication status.');
}

if (approval.stillRequiredBeforePublication.toSorted().join(',') !== expectedRemaining) {
  throw new Error(
    'Publication must still require provenance, visual, audio and app-flow validation.',
  );
}

console.info('Start A1 linguistic approval validation passed.');
