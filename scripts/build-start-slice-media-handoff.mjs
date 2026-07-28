import { readFile, writeFile } from 'node:fs/promises';

const contentRoot = new URL('../content/packs/learnbox-start/', import.meta.url);
const draftFile = new URL('vocabulary/start-a1-vertical-slice-drafts.json', contentRoot);
const handoffFile = new URL('prompts/start-a1-slice-media-handoff.json', contentRoot);
const drafts = JSON.parse(await readFile(draftFile, 'utf8'));

const handoff = {
  batchId: drafts.batchId,
  state: 'planning_only',
  generatedAt: '2026-07-28',
  providerRequestAllowed: false,
  publicationBlocked: true,
  requirements: {
    image: 'Use the draft image prompt and complete visual/Bobo QA before attachment.',
    wordAudio: 'Generate one clear de-DE pronunciation of the lemma or expression.',
    sentenceAudio: 'Generate one clear de-DE pronunciation of the practical example.',
  },
  assets: drafts.items.flatMap((item) => [
    {
      assetId: `${item.id}-image-v1`,
      contentId: item.id,
      kind: 'image',
      storageKey: `${item.id}/image/v1`,
      state: 'not_requested',
      prompt: item.imagePrompt,
    },
    {
      assetId: `${item.id}-word-audio-v1`,
      contentId: item.id,
      kind: 'word_audio',
      storageKey: `${item.id}/word_audio/v1`,
      state: 'not_requested',
      locale: item.pronunciation.locale,
      text: item.lemma,
    },
    {
      assetId: `${item.id}-sentence-audio-v1`,
      contentId: item.id,
      kind: 'sentence_audio',
      storageKey: `${item.id}/sentence_audio/v1`,
      state: 'not_requested',
      locale: item.pronunciation.locale,
      text: item.examples[0].german,
    },
  ]),
};

const serializedHandoff = `${JSON.stringify(handoff, null, 2)}\n`;

if (process.argv.includes('--write')) {
  await writeFile(handoffFile, serializedHandoff);
  console.info('Start A1 media handoff written; no provider request was made.');
  process.exit(0);
}

const existingHandoff = await readFile(handoffFile, 'utf8');
if (existingHandoff !== serializedHandoff) {
  throw new Error('Start A1 media handoff is stale. Run pnpm build:media-handoff.');
}

if (handoff.assets.length !== drafts.items.length * 3) {
  throw new Error('Media handoff must have image, word-audio and sentence-audio entries per card.');
}

if (!handoff.assets.every((asset) => asset.state === 'not_requested')) {
  throw new Error('Media handoff must not request a provider or claim generated media.');
}

console.info('Start A1 media handoff is current and remains planning-only.');
