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
const mediaModule = new URL('../apps/website/app/start-media.ts', import.meta.url);
const mediaVisual = new URL('../apps/website/app/components/StartMediaVisual.tsx', import.meta.url);

const drafts = JSON.parse(await readFile(draftFile, 'utf8'));
const approval = JSON.parse(await readFile(approvalFile, 'utf8'));
const stagingSource = await readFile(stagingModule, 'utf8');
const websiteSource = await readFile(websitePage, 'utf8');
const mediaSource = await readFile(mediaModule, 'utf8');
const mediaVisualSource = await readFile(mediaVisual, 'utf8');

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

if (!mediaVisualSource.includes('تصویر و صدای ضبط‌شدهٔ این کارت در حال آماده‌سازی است.')) {
  throw new Error('Staged cards must clearly disclose pending production media.');
}

if (
  !websiteSource.includes('resolveStartMediaMode({') ||
  !mediaSource.includes("hostname === 'localhost' || hostname === '127.0.0.1'")
) {
  throw new Error('Candidate media may only appear in the local preview.');
}

if (
  !mediaSource.includes("mode === 'private-session' ? 'private-media' : 'local-preview-media'") ||
  !mediaSource.includes('const basePath = `/api/${route}/${contentId}`')
) {
  throw new Error('The staged Start slice must map image candidates through the local-only route.');
}

if (stagingSource.includes('/api/') || stagingSource.includes('candidateMedia')) {
  throw new Error('The Start content slice must remain independent from delivery routes.');
}

console.info('Website Start slice staging is valid and remains publication-blocked.');
