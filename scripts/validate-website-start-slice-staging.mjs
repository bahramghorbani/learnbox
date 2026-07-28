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

const drafts = JSON.parse(await readFile(draftFile, 'utf8'));
const approval = JSON.parse(await readFile(approvalFile, 'utf8'));
const stagingSource = await readFile(stagingModule, 'utf8');

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

console.info('Website Start slice staging is valid and remains publication-blocked.');
