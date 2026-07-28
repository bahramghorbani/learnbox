import { readFile } from 'node:fs/promises';

const draftFile = new URL(
  '../content/packs/learnbox-start/vocabulary/start-a1-vertical-slice-drafts.json',
  import.meta.url,
);
const approvalFile = new URL(
  '../content/packs/learnbox-start/validation/start-a1-slice-linguistic-approval.json',
  import.meta.url,
);
const stagingModule = new URL('../apps/website/app/start-slice.ts', import.meta.url);
const websitePage = new URL('../apps/website/app/page.tsx', import.meta.url);

const drafts = JSON.parse(await readFile(draftFile, 'utf8'));
const approval = JSON.parse(await readFile(approvalFile, 'utf8'));
const stagingSource = await readFile(stagingModule, 'utf8');
const websiteSource = await readFile(websitePage, 'utf8');

if (drafts.items.length !== 20) {
  throw new Error('The web staging slice must contain the approved 20 draft items.');
}

if (approval.approvedDimensions.join(',') !== 'german_linguistic,persian_translation') {
  throw new Error('Web staging requires the recorded linguistic approval.');
}

if (!drafts.items.every((item) => item.status === 'needs_review' && item.media.length === 0)) {
  throw new Error('Web staging must not treat draft media as production-ready.');
}

if (!stagingSource.includes('start-a1-vertical-slice-drafts.json')) {
  throw new Error('The website must read directly from the controlled Start slice draft source.');
}

if (!stagingSource.includes('dailySessionSize = 3')) {
  throw new Error('The staged daily session must remain limited to three cards.');
}

const coveredItemIds = new Set();
for (let dayNumber = 0; dayNumber < drafts.items.length; dayNumber += 1) {
  const firstIndex = (dayNumber * 3) % drafts.items.length;
  for (let offset = 0; offset < 3; offset += 1) {
    coveredItemIds.add(drafts.items[(firstIndex + offset) % drafts.items.length].id);
  }
}

if (coveredItemIds.size !== drafts.items.length) {
  throw new Error('The daily schedule must expose every Start card across the cycle.');
}

if (!websiteSource.includes('cardId: studyItems[sessionIndex].id')) {
  throw new Error('Offline review events must record the stable Start card identifier.');
}

if (!websiteSource.includes('تصویر و صدای ضبط‌شدهٔ این کارت در حال آماده‌سازی است.')) {
  throw new Error('Staged cards must clearly disclose pending production media.');
}

if (!websiteSource.includes('PronunciationButton text={currentItem.german} preview')) {
  throw new Error('Staged cards must identify browser pronunciation as a preview.');
}

console.info('Website Start slice staging is valid and remains publication-blocked.');
