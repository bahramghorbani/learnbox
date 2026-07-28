import { access, readFile } from 'node:fs/promises';

const contentRoot = new URL('../content/packs/learnbox-start/', import.meta.url);
const drafts = JSON.parse(
  await readFile(new URL('vocabulary/start-a1-vertical-slice-drafts.json', contentRoot), 'utf8'),
);
const audioQa = JSON.parse(
  await readFile(
    new URL('validation/start-a1-avalai-audio-transcription-qa.json', contentRoot),
    'utf8',
  ),
);
const routeSource = await readFile(
  new URL(
    '../apps/website/app/api/local-preview-media/[contentId]/[kind]/route.ts',
    import.meta.url,
  ),
  'utf8',
);

if (audioQa.total !== 40 || audioQa.passed !== 40 || audioQa.needsReview.length !== 0) {
  throw new Error('All 40 local audio candidates must pass transcription QA.');
}

for (const item of drafts.items) {
  await Promise.all([
    access(new URL(`images/${item.id}-image-v1.png`, contentRoot)),
    access(new URL(`audio/${item.id}-word-audio-v1.mp3`, contentRoot)),
    access(new URL(`audio/${item.id}-sentence-audio-v1.mp3`, contentRoot)),
  ]);
}

if (!routeSource.includes("process.env.NODE_ENV !== 'development'")) {
  throw new Error('The candidate media route must remain limited to local development.');
}

console.info('Local Start media preview is complete and remains development-only.');
