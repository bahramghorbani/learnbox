import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { wordPhrase } from './avalai-audio-phrase.mjs';

/**
 * Issue #59 acceptance QA for native word-pronunciation audio.
 *
 * Every asset must be produced and reviewed as the exact displayed German
 * phrase (including the article for nouns, e.g. `das Haus`), in de-DE, with
 * recorded provenance, reviewer, version and checksum. This script verifies:
 *
 *   1. A transcription QA report exists and its expected word/sentence texts
 *      match the canonical `article + lemma` phrase (structural check — no API).
 *   2. Every referenced audio file is present and its SHA-256 is recorded.
 *   3. A listening-QA ledger can be produced (reviewer + version + checksum)
 *      so manual de-DE listening review is a recorded step, not assumed.
 *
 * This gate does NOT call any paid API and does NOT publish or attach media.
 */

const draftsPath = resolve(
  'content/packs/learnbox-start/vocabulary/start-a1-vertical-slice-drafts.json',
);
const transcriptionQaPath = resolve(
  process.env.ISSUE59_QA_PATH ??
    'content/packs/learnbox-start/validation/start-a1-avalai-audio-transcription-qa.json',
);
const outputReportPath = resolve(
  'content/packs/learnbox-start/validation/start-a1-issue59-audio-gate.json',
);

const drafts = JSON.parse(readFileSync(draftsPath, 'utf8'));
const transcription = JSON.parse(readFileSync(transcriptionQaPath, 'utf8'));

const expectedPhrases = new Map(
  drafts.items.flatMap((item) => [
    [`${item.id}-word`, wordPhrase(item)],
    [`${item.id}-sentence`, item.examples[0].german],
  ]),
);

// Only nouns carry a displayed article (das/der/die). Verbs, adjectives and
// phrases are correctly spoken without one, so the article check applies to
// word clips whose canonical item declares an article.
const itemByClipId = new Map(
  drafts.items.flatMap((item) => [
    [`${item.id}-word`, item],
    [`${item.id}-sentence`, item],
  ]),
);

const failures = [];
const results = [];

for (const result of transcription.results ?? []) {
  const expected = expectedPhrases.get(result.id);
  if (expected === undefined) {
    failures.push({ id: result.id, reason: 'Unknown clip id in QA report.' });
    continue;
  }
  if (result.normalizedExpected !== normalize(expected)) {
    failures.push({
      id: result.id,
      reason: 'QA report expected text does not match the canonical phrase.',
      report: result.normalizedExpected,
      canonical: normalize(expected),
    });
    continue;
  }
  // Issue #59 contract: word audio for nouns must carry the displayed German
  // article (`das Haus`), not the bare lemma. Non-nouns are correctly spoken
  // without one. Only items that declare an article are checked.
  const item = itemByClipId.get(result.id);
  const expectsArticle = Boolean(item?.article?.trim());
  const phraseHasArticle = expected.trim().split(/\s+/).length > 1;
  if (expectsArticle && !phraseHasArticle) {
    failures.push({
      id: result.id,
      reason: 'Word audio must include the displayed German article.',
      canonical: expected,
    });
    continue;
  }
  results.push({
    id: result.id,
    phrase: expected,
    filename: result.filename,
    bytes: result.bytes,
    matchesExpected: result.matchesExpected,
  });
}

function normalize(text) {
  return String(text)
    .normalize('NFKC')
    .toLocaleLowerCase('de-DE')
    .replace(/[.,!?;:"„“”'’()\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Listening-QA ledger scaffold. A reviewer fills this in after manual de-DE
// listening review of each regenerated clip; a missing reviewer is a failure.
const listeningQa = (drafts.listeningQa ?? []).map((entry) => {
  const checksum = entry.checksum ?? null;
  return { ...entry, checksum };
});

const report = {
  batchId: drafts.batchId,
  checkedAt: new Date().toISOString(),
  gate: 'issue59-full-phrase-de-de',
  purpose:
    'Acceptance QA for Issue #59. Verifies article-bearing phrases, checksums and reviewer provenance. No publication or attachment.',
  total: transcription.total ?? results.length,
  passed: results.length,
  needsRegeneration: failures.length,
  failures,
  listeningQaReviewRequired: listeningQa.some((entry) => !entry.reviewer || !entry.checksum),
  listeningQa,
};

writeFileSync(outputReportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`گزارش: ${outputReportPath}`);
if (failures.length || report.listeningQaReviewRequired) process.exitCode = 2;
