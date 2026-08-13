import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildMobileStartContent } from './mobile-start-content.mjs';
import { verifyMobileStartContentArtifacts } from './sync-mobile-start-content.mjs';

const source = JSON.parse(
  await readFile(
    new URL(
      '../content/packs/learnbox-start/vocabulary/start-a1-vertical-slice-drafts.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

test('projects the canonical daily session as the three approved mobile cards', () => {
  const content = buildMobileStartContent(source);

  assert.deepEqual(content, {
    cards: [
      {
        id: 'start-a1-haus',
        german: 'das Haus',
        persian: 'خانه',
        definition: 'Ein Gebäude, in dem Menschen wohnen.',
        example: { german: 'Das Haus ist klein.', persian: 'خانه کوچک است.' },
        imageAsset: 'assets/cards/start-a1-haus.png',
        wordAudioAsset: 'audio/start-a1-haus-word-audio-v1.mp3',
        sentenceAudioAsset: 'audio/start-a1-haus-sentence-audio-v1.mp3',
      },
      {
        id: 'start-a1-tisch',
        german: 'der Tisch',
        persian: 'میز',
        definition: 'Ein Möbelstück mit einer flachen Fläche.',
        example: { german: 'Der Tisch ist groß.', persian: 'میز بزرگ است.' },
        imageAsset: 'assets/cards/start-a1-tisch.png',
        wordAudioAsset: 'audio/start-a1-tisch-word-audio-v1.mp3',
        sentenceAudioAsset: 'audio/start-a1-tisch-sentence-audio-v1.mp3',
      },
      {
        id: 'start-a1-tuer',
        german: 'die Tür',
        persian: 'در',
        definition: 'Man öffnet und schließt sie, um in einen Raum zu gehen.',
        example: { german: 'Die Tür ist offen.', persian: 'در باز است.' },
        imageAsset: 'assets/cards/start-a1-tuer.png',
        wordAudioAsset: 'audio/start-a1-tuer-word-audio-v1.mp3',
        sentenceAudioAsset: 'audio/start-a1-tuer-sentence-audio-v1.mp3',
      },
    ],
  });
});

test('rejects a canonical source without every required daily-session card', () => {
  const sourceWithoutTuer = {
    ...source,
    items: source.items.filter((item) => item.id !== 'start-a1-tuer'),
  };

  assert.throws(() => buildMobileStartContent(sourceWithoutTuer), /start-a1-tuer/);
});

test('byte-for-byte verifier rejects a mismatched packaged card PNG', () => {
  const canonicalImages = {
    'start-a1-haus': Buffer.from([1, 2, 3]),
    'start-a1-tisch': Buffer.from([4, 5, 6]),
    'start-a1-tuer': Buffer.from([7, 8, 9]),
  };
  const packagedImages = {
    ...canonicalImages,
    'start-a1-tisch': Buffer.from([4, 5, 0]),
  };

  assert.throws(
    () =>
      verifyMobileStartContentArtifacts({
        generatedJson: '{"cards":[]}\n',
        committedJson: '{"cards":[]}\n',
        canonicalImages,
        packagedImages,
      }),
    /start-a1-tisch.*SHA-256/,
  );
});

test('byte-for-byte verifier rejects a mismatched packaged pronunciation MP3', () => {
  const canonicalImages = Object.fromEntries(
    ['start-a1-haus', 'start-a1-tisch', 'start-a1-tuer'].map((id) => [id, Buffer.from(id)]),
  );
  const canonicalAudio = {
    'start-a1-haus-word-audio-v1.mp3': Buffer.from([1, 2]),
    'start-a1-haus-sentence-audio-v1.mp3': Buffer.from([3, 4]),
    'start-a1-tisch-word-audio-v1.mp3': Buffer.from([5, 6]),
    'start-a1-tisch-sentence-audio-v1.mp3': Buffer.from([7, 8]),
    'start-a1-tuer-word-audio-v1.mp3': Buffer.from([9, 10]),
    'start-a1-tuer-sentence-audio-v1.mp3': Buffer.from([11, 12]),
  };

  assert.throws(
    () =>
      verifyMobileStartContentArtifacts({
        generatedJson: '{"cards":[]}\n',
        committedJson: '{"cards":[]}\n',
        canonicalImages,
        packagedImages: canonicalImages,
        canonicalAudio,
        packagedAudio: { ...canonicalAudio, 'start-a1-tuer-word-audio-v1.mp3': Buffer.from([0]) },
      }),
    /start-a1-tuer-word-audio-v1\.mp3.*SHA-256/,
  );
});

test('root check runs the mobile Node contract and byte verifier', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );

  assert.match(packageJson.scripts.check, /pnpm test:mobile-start-content/);
  assert.match(packageJson.scripts.check, /pnpm verify:mobile-start-content/);
});
