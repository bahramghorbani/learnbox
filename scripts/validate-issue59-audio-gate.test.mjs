import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildIssue59AudioGate } from './validate-issue59-audio-gate.mjs';

const contentRoot = new URL('../content/packs/learnbox-start/', import.meta.url);
const drafts = JSON.parse(
  await readFile(new URL('vocabulary/start-a1-vertical-slice-drafts.json', contentRoot), 'utf8'),
);
const ledger = JSON.parse(
  await readFile(new URL('validation/start-a1-issue59-audio-ledger.json', contentRoot), 'utf8'),
);

test('Issue #59 gate reports the committed V2 ledger fail-closed', () => {
  const report = buildIssue59AudioGate({ drafts, ledger });

  assert.equal(report.total, 40);
  assert.equal(report.transcriptionMatched, 36);
  assert.equal(report.needsRegeneration, 4);
  assert.equal(report.listeningApproved, 6);
  assert.equal(report.listeningPending, 34);
  assert.equal(report.releaseReady, false);
  assert.equal(report.attachmentAllowed, false);
  assert.equal(report.publicationBlocked, true);
  assert.deepEqual(report.blockers, [
    '4 clips have transcription mismatches',
    '34 clips still require de-DE listening review',
  ]);
});

test('Issue #59 gate rejects incomplete ledgers instead of treating an empty review list as passed', () => {
  const incompleteLedger = structuredClone(ledger);
  incompleteLedger.entries = [];
  incompleteLedger.total = 0;

  assert.throws(
    () => buildIssue59AudioGate({ drafts, ledger: incompleteLedger }),
    /exactly 40 unique V2 audio entries/,
  );
});

test('Issue #59 gate rejects approval without reviewer evidence', () => {
  const inconsistentLedger = structuredClone(ledger);
  const approved = inconsistentLedger.entries.find((entry) => entry.approved === true);
  approved.reviewer = null;

  assert.throws(
    () => buildIssue59AudioGate({ drafts, ledger: inconsistentLedger }),
    /approved listening QA requires a reviewer/,
  );
});
