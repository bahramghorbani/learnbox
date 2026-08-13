import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildMobileStartContent } from './mobile-start-content.mjs';

const cardIds = ['start-a1-haus', 'start-a1-tisch', 'start-a1-tuer'];
const sourceFile = new URL(
  '../content/packs/learnbox-start/vocabulary/start-a1-vertical-slice-drafts.json',
  import.meta.url,
);
const outputFile = new URL('../apps/mobile/assets/content/start-a1-v1.json', import.meta.url);
const audioVariants = ['word', 'sentence'];

export function verifyMobileStartContentArtifacts({
  generatedJson,
  committedJson,
  canonicalImages,
  packagedImages,
  canonicalAudio = {},
  packagedAudio = {},
}) {
  if (committedJson !== generatedJson) {
    throw new Error(
      'Mobile Start JSON is out of sync. Run node scripts/sync-mobile-start-content.mjs.',
    );
  }

  for (const cardId of cardIds) {
    const canonical = canonicalImages[cardId];
    const packaged = packagedImages[cardId];
    if (!Buffer.isBuffer(canonical) || !Buffer.isBuffer(packaged)) {
      throw new Error(`Mobile Start image pair is missing for ${cardId}.`);
    }
    if (!canonical.equals(packaged)) {
      throw new Error(
        `Mobile Start image mismatch for ${cardId}: canonical SHA-256 ${sha256(
          canonical,
        )}, packaged SHA-256 ${sha256(packaged)}.`,
      );
    }
  }

  for (const cardId of cardIds) {
    for (const variant of audioVariants) {
      const filename = `${cardId}-${variant}-audio-v1.mp3`;
      const canonical = canonicalAudio[filename];
      const packaged = packagedAudio[filename];
      if (!Buffer.isBuffer(canonical) || !Buffer.isBuffer(packaged)) {
        throw new Error(`Mobile Start audio pair is missing for ${filename}.`);
      }
      if (!canonical.equals(packaged)) {
        throw new Error(
          `Mobile Start audio mismatch for ${filename}: canonical SHA-256 ${sha256(
            canonical,
          )}, packaged SHA-256 ${sha256(packaged)}.`,
        );
      }
    }
  }
}

async function run() {
  const generated = `${JSON.stringify(
    buildMobileStartContent(JSON.parse(await readFile(sourceFile, 'utf8'))),
    null,
    2,
  )}\n`;

  if (process.argv.includes('--check')) {
    const [committed, canonicalImages, packagedImages, canonicalAudio, packagedAudio] =
      await Promise.all([
        readFile(outputFile, 'utf8'),
        readImages(
          (cardId) =>
            new URL(
              `../content/packs/learnbox-start/images/${cardId}-image-v2.png`,
              import.meta.url,
            ),
        ),
        readImages(
          (cardId) => new URL(`../apps/mobile/assets/cards/${cardId}.png`, import.meta.url),
        ),
        readAudio(
          (filename) =>
            new URL(`../content/packs/learnbox-start/audio/${filename}`, import.meta.url),
        ),
        readAudio(
          (filename) => new URL(`../apps/mobile/assets/audio/${filename}`, import.meta.url),
        ),
      ]);
    verifyMobileStartContentArtifacts({
      generatedJson: generated,
      committedJson: committed,
      canonicalImages,
      packagedImages,
      canonicalAudio,
      packagedAudio,
    });
    console.log(
      'Mobile Start JSON, three packaged PNGs and six pronunciation MP3s match canonical sources byte-for-byte.',
    );
    return;
  }

  await writeFile(outputFile, generated);
  console.log('Mobile Start content synchronized.');
}

async function readImages(resolveUrl) {
  return Object.fromEntries(
    await Promise.all(cardIds.map(async (cardId) => [cardId, await readFile(resolveUrl(cardId))])),
  );
}

async function readAudio(resolveUrl) {
  const filenames = cardIds.flatMap((cardId) =>
    audioVariants.map((variant) => `${cardId}-${variant}-audio-v1.mp3`),
  );
  return Object.fromEntries(
    await Promise.all(
      filenames.map(async (filename) => [filename, await readFile(resolveUrl(filename))]),
    ),
  );
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

const isMain =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  await run();
}
