import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { wordPhrase } from './avalai-audio-phrase.mjs';

const draftsUrl = new URL(
  '../content/packs/learnbox-start/vocabulary/start-a1-vertical-slice-drafts.json',
  import.meta.url,
);
const ledgerUrl = new URL(
  '../content/packs/learnbox-start/validation/start-a1-issue59-audio-ledger.json',
  import.meta.url,
);
const reportUrl = new URL(
  '../content/packs/learnbox-start/validation/start-a1-issue59-audio-gate.json',
  import.meta.url,
);

const fail = (message) => {
  throw new Error(`Invalid Issue #59 audio evidence: ${message}`);
};

function normalize(text) {
  return String(text)
    .normalize('NFKC')
    .toLocaleLowerCase('de-DE')
    .replace(/[.,!?;:"„“”'’()\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildIssue59AudioGate({ drafts, ledger }) {
  if (ledger.batchId !== drafts.batchId) fail('ledger and draft batch IDs must match.');
  if (ledger.gate !== 'issue59-full-phrase-de-de') fail('unexpected gate identifier.');
  if (ledger.locale !== 'de-DE') fail('the V2 ledger must remain de-DE.');

  const expected = new Map(
    drafts.items.flatMap((item) => [
      [
        `${item.id}-word-audio-v2`,
        { contentId: item.id, kind: 'word_audio', phrase: wordPhrase(item) },
      ],
      [
        `${item.id}-sentence-audio-v2`,
        { contentId: item.id, kind: 'sentence_audio', phrase: item.examples[0].german },
      ],
    ]),
  );
  const entries = ledger.entries ?? [];
  const ids = new Set(entries.map((entry) => entry.assetId));
  if (expected.size !== 40 || entries.length !== 40 || ids.size !== 40) {
    fail('exactly 40 unique V2 audio entries are required.');
  }

  const failures = [];
  let listeningApproved = 0;
  let listeningPending = 0;

  for (const entry of entries) {
    const target = expected.get(entry.assetId);
    if (!target) fail(`unknown asset id ${entry.assetId}.`);
    if (normalize(entry.phrase) !== normalize(target.phrase)) {
      fail(`${entry.assetId} phrase does not match the canonical draft.`);
    }
    if (!entry.file?.trim() || !Number.isInteger(entry.bytes) || entry.bytes <= 0) {
      fail(`${entry.assetId} must record a filename and positive byte count.`);
    }
    if (!/^[a-f0-9]{64}$/.test(entry.sha256 ?? '')) {
      fail(`${entry.assetId} must record a SHA-256 checksum.`);
    }
    if (typeof entry.transcriptionMatched !== 'boolean') {
      fail(`${entry.assetId} must record transcriptionMatched.`);
    }

    if (entry.approved === true) {
      if (entry.listeningQa !== 'reviewed_de-de' || !entry.reviewer?.trim()) {
        fail(`${entry.assetId} approved listening QA requires a reviewer.`);
      }
      listeningApproved += 1;
    } else if (
      entry.approved === false &&
      entry.listeningQa === 'pending_reviewer' &&
      entry.reviewer === null
    ) {
      listeningPending += 1;
    } else {
      fail(`${entry.assetId} has an inconsistent listening-QA state.`);
    }

    if (!entry.transcriptionMatched) {
      failures.push({
        assetId: entry.assetId,
        reason: 'transcription_mismatch',
      });
    }
  }

  for (const assetId of expected.keys()) {
    if (!ids.has(assetId)) fail(`missing expected asset ${assetId}.`);
  }

  const transcriptionMatched = entries.length - failures.length;
  const blockers = [];
  if (failures.length) blockers.push(`${failures.length} clips have transcription mismatches`);
  if (listeningPending) {
    blockers.push(`${listeningPending} clips still require de-DE listening review`);
  }
  const releaseReady = blockers.length === 0 && listeningApproved === entries.length;

  return {
    batchId: ledger.batchId,
    gate: ledger.gate,
    purpose:
      'Derived fail-closed status for Issue #59 V2 audio evidence. This does not attach, approve or publish media.',
    evidenceSource: 'content/packs/learnbox-start/validation/start-a1-issue59-audio-ledger.json',
    evidenceGeneratedAt: ledger.generatedAt,
    model: ledger.model,
    voice: ledger.voice,
    locale: ledger.locale,
    total: entries.length,
    transcriptionMatched,
    needsRegeneration: failures.length,
    listeningApproved,
    listeningPending,
    releaseReady,
    attachmentAllowed: false,
    publicationBlocked: true,
    blockers,
    failures,
  };
}

export async function validateIssue59AudioGate({ write = false } = {}) {
  const [drafts, ledger] = await Promise.all([
    readFile(draftsUrl, 'utf8').then(JSON.parse),
    readFile(ledgerUrl, 'utf8').then(JSON.parse),
  ]);
  const report = buildIssue59AudioGate({ drafts, ledger });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (write) {
    await writeFile(reportUrl, serialized);
  } else {
    const committed = await readFile(reportUrl, 'utf8');
    if (committed !== serialized) fail('committed gate report is stale; run with --write.');
  }

  console.log(
    `ISSUE59_AUDIO_GATE_OK total=${report.total} transcription=${report.transcriptionMatched} listening=${report.listeningApproved} releaseReady=${report.releaseReady}`,
  );
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await validateIssue59AudioGate({ write: process.argv.includes('--write') });
}
