import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Builds a checksum + provenance ledger for the Issue #59 regenerated audio.
 *
 * Records every `-v2.mp3` candidate: exact displayed German phrase (with
 * article for nouns), bytes, SHA-256, transcription result, and a listening-QA
 * status. A clip is only `approved` when a reviewer has confirmed de-DE
 * pronunciation by ear; nothing here attaches media or publishes it.
 */

const candidatesDir = resolve(
  '/Users/test/.codex/tmp/learnbox-avalai/audio-candidates',
);
const draftsPath = resolve(
  'content/packs/learnbox-start/vocabulary/start-a1-vertical-slice-drafts.json',
);
const qaPath = resolve(candidatesDir, 'audio-transcription-qa.json');
const outputPath = resolve(
  'content/packs/learnbox-start/validation/start-a1-issue59-audio-ledger.json',
);

const drafts = JSON.parse(readFileSync(draftsPath, 'utf8'));
const qa = JSON.parse(readFileSync(qaPath, 'utf8'));
const phraseById = new Map(
  drafts.items.flatMap((item) => [
    [`${item.id}-word`, phrase(item)],
    [`${item.id}-sentence`, item.examples[0].german],
  ]),
);

function phrase(item) {
  const article = item.article?.trim();
  return article ? `${article} ${item.lemma}` : item.lemma;
}

const qaById = new Map((qa.results ?? []).map((r) => [r.id, r]));

const files = readdirSync(candidatesDir).filter((f) => f.endsWith('-v2.mp3')).sort();
const entries = files.map((file) => {
  const id = file.replace(/-v2\.mp3$/, '');
  const buffer = readFileSync(resolve(candidatesDir, file));
  const qaResult = qaById.get(id);
  return {
    assetId: `${id}-audio-v2`,
    file,
    phrase: phraseById.get(id),
    bytes: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    transcriptionMatched: qaResult?.matchesExpected ?? false,
    transcriptionTranscript: qaResult?.transcript ?? null,
    listeningQa: 'pending_reviewer', // filled by manual de-DE listening review
    reviewer: null,
    approved: false,
  };
});

const ledger = {
  batchId: drafts.batchId,
  gate: 'issue59-full-phrase-de-de',
  purpose:
    'Checksum + provenance ledger for Issue #59 regenerated audio. Records phrase, checksum and QA state. Nothing is attached or published.',
  generatedAt: new Date().toISOString(),
  model: 'eleven_flash_v2_5',
  voice: 'coral',
  locale: 'de-DE',
  total: entries.length,
  entries,
};

writeFileSync(outputPath, `${JSON.stringify(ledger, null, 2)}\n`);
console.log(`گزارش: ${outputPath}`);
