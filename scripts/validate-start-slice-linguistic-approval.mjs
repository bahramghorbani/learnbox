import { readFile } from 'node:fs/promises';

const contentRoot = new URL('../content/packs/learnbox-start/', import.meta.url);
const drafts = JSON.parse(
  await readFile(new URL('vocabulary/start-a1-vertical-slice-drafts.json', contentRoot), 'utf8'),
);
const pendingDrafts = JSON.parse(
  await readFile(
    new URL('vocabulary/start-a1-catalog-35-pending-drafts.json', contentRoot),
    'utf8',
  ),
);
const approval = JSON.parse(
  await readFile(
    new URL('validation/start-a1-slice-linguistic-approval.json', contentRoot),
    'utf8',
  ),
);

const expectedDimensions = 'german_linguistic,persian_translation';
const expectedRemaining = 'app_flow,audio,provenance,visual';
const fail = (message) => {
  throw new Error(`Invalid Start A1 linguistic approval: ${message}`);
};

const sliceBatch = 'learnbox-start-a1-vertical-slice-drafts-v1';
const pendingBatch = 'learnbox-start-a1-catalog-35-pending-drafts-v1';

if (approval.batchId !== drafts.batchId) {
  fail('the approval ledger must stay anchored to the original Start slice batch.');
}
if (approval.approvedByRole !== 'product_owner') {
  fail('the approval ledger must identify the product owner role.');
}
if (approval.approvedDimensions.join(',') !== expectedDimensions) {
  fail('the approval ledger may only cover German and Persian linguistic dimensions.');
}
if (!Array.isArray(approval.approvalEvents) || approval.approvalEvents.length !== 2) {
  fail('the approval ledger must record the 2026-07-27 and 2026-09-04 owner confirmations.');
}
if (approval.stillRequiredBeforePublication.toSorted().join(',') !== expectedRemaining) {
  fail('publication must still require provenance, visual, audio and app-flow validation.');
}

const sliceItems = drafts.items;
const pendingItems = pendingDrafts.items;
const canonicalIds = [...sliceItems, ...pendingItems].map((item) => item.id);
if (new Set(canonicalIds).size !== 35) {
  fail('slice and pending drafts must name 35 unique canonical items.');
}

const eventsByBatch = new Map(approval.approvalEvents.map((event) => [event.batchId, event]));
const sliceEvent = eventsByBatch.get(sliceBatch);
const pendingEvent = eventsByBatch.get(pendingBatch);
if (!sliceEvent || !pendingEvent) {
  fail('each owner confirmation must reference its own draft batch.');
}

const approvedByRole = approval.approvedByRole;
const checkEvent = (event, batchItems, expectedReference, expectedAt) => {
  if (event.approvedByRole !== approvedByRole)
    fail('every confirmation needs the product owner role.');
  if (event.approvedDimensions.join(',') !== expectedDimensions) {
    fail('confirmations may only cover German and Persian linguistic dimensions.');
  }
  if (event.approvalReference !== expectedReference) {
    fail(`confirmation ${expectedReference} must keep its recorded reference.`);
  }
  if (event.approvedAt !== expectedAt) {
    fail(`confirmation ${expectedReference} must keep its recorded date.`);
  }
  const eventIds = new Set(event.itemIds);
  if (eventIds.size !== batchItems.length || !batchItems.every((item) => eventIds.has(item.id))) {
    fail(`confirmation ${expectedReference} must cover every item of its batch exactly once.`);
  }
};
checkEvent(sliceEvent, sliceItems, 'product-owner-confirmation-2026-07-27', '2026-07-27');
checkEvent(pendingEvent, pendingItems, 'product-owner-confirmation-2026-09-04', '2026-09-04');

const approvedIds = new Set(approval.itemIds);
const canonicalSet = new Set(canonicalIds);
if (approval.itemIds.length !== canonicalIds.length || approvedIds.size !== canonicalIds.length) {
  fail('the approval ledger must list every canonical item exactly once.');
}
if (canonicalIds.some((id) => !approvedIds.has(id))) {
  fail('the approval ledger must cover every canonical item.');
}
if ([...approvedIds].some((id) => !canonicalSet.has(id))) {
  fail('the approval ledger must not list unknown item ids.');
}

for (const item of [...sliceItems, ...pendingItems]) {
  if (item.status !== 'needs_review') {
    fail('linguistic approval must not change draft publication status.');
  }
}

console.info('Start A1 linguistic approval validation passed (20 slice + 15 pending items).');
