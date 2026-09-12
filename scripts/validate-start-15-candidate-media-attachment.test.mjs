import assert from 'node:assert/strict';
import { format, resolveConfig } from 'prettier';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildStart15CandidateMediaAttachmentDraft } from './build-start-15-candidate-media-attachment-draft.mjs';
import { assertStart15CandidateMediaAttachmentPrepared } from './validate-start-15-candidate-media-attachment.mjs';

const contentRoot = new URL('../content/packs/learnbox-start/', import.meta.url);
const candidates = JSON.parse(
  await readFile(
    new URL('validation/start-a1-catalog-35-pending-candidates.json', contentRoot),
    'utf8',
  ),
);
const provenanceLedger = JSON.parse(
  await readFile(
    new URL('validation/start-a1-catalog-35-pending-provenance-ledger.json', contentRoot),
    'utf8',
  ),
);
const catalogSlice = JSON.parse(
  await readFile(new URL('validation/start-a1-35-catalog-slice.json', contentRoot), 'utf8'),
);
const committedDraft = JSON.parse(
  await readFile(
    new URL('validation/start-a1-15-candidate-media-attachment-draft.json', contentRoot),
    'utf8',
  ),
);

function build(overrides = {}) {
  return buildStart15CandidateMediaAttachmentDraft({
    candidates,
    provenanceLedger,
    catalogSlice,
    ...overrides,
  });
}

test('the committed preparation draft matches its sources and formatter output', async () => {
  const expected = build();
  const committedSource = await readFile(
    new URL('validation/start-a1-15-candidate-media-attachment-draft.json', contentRoot),
    'utf8',
  );

  assert.deepEqual(committedDraft, expected);
  assert.equal(
    committedSource,
    await format(JSON.stringify(expected), {
      ...(await resolveConfig(
        new URL('validation/start-a1-15-candidate-media-attachment-draft.json', contentRoot)
          .pathname,
      )),
      filepath: new URL('validation/start-a1-15-candidate-media-attachment-draft.json', contentRoot)
        .pathname,
    }),
  );
  assert.doesNotThrow(() => assertStart15CandidateMediaAttachmentPrepared(committedDraft));
  assert.equal(committedDraft.assets.length, 45);
  assert.equal(committedDraft.state, 'prepared_awaiting_private_upload');
  assert.equal(committedDraft.uploadPerformed, false);
});

test('rejects an asset marked attached, uploaded or otherwise complete', () => {
  for (const status of [
    'verified_private_storage_not_attached',
    'attached',
    'uploaded',
    'upload_complete',
  ]) {
    const tampered = structuredClone(committedDraft);
    tampered.assets[0].attachmentStatus = status;
    assert.throws(
      () => assertStart15CandidateMediaAttachmentPrepared(tampered),
      /awaiting_private_upload/,
      `status ${status} must be rejected`,
    );
  }
});

test('rejects an invented private locator or copied private metadata', () => {
  for (const key of [
    'url',
    'pathname',
    'sha256',
    'checksum',
    'bytes',
    'size',
    'relativePath',
    'file',
  ]) {
    const tampered = structuredClone(committedDraft);
    tampered.assets[0][key] = key === 'bytes' || key === 'size' ? 1234 : 'private-value';
    assert.throws(
      () => assertStart15CandidateMediaAttachmentPrepared(tampered),
      new RegExp(`forbidden field ${key}`),
    );
  }
});

test('rejects a preparation that would authorize attachment, upload or publication', () => {
  for (const [key, value] of [
    ['attachmentAllowed', true],
    ['uploadPerformed', true],
    ['publicationBlocked', false],
    ['state', 'uploaded'],
  ]) {
    const tampered = structuredClone(committedDraft);
    tampered[key] = value;
    assert.throws(() => assertStart15CandidateMediaAttachmentPrepared(tampered));
  }
});

test('rejects an incomplete candidate set instead of treating fewer items as ready', () => {
  const fewer = structuredClone(candidates);
  fewer.candidates = fewer.candidates.slice(1);

  assert.throws(() => build({ candidates: fewer }), /exactly 15/);
});

test('rejects a source ledger that would allow attachment before upload', () => {
  const allowed = structuredClone(provenanceLedger);
  allowed.candidateMedia.attachmentAllowed = true;

  assert.throws(() => build({ provenanceLedger: allowed }), /attachmentAllowed/);
});

test('rejects a candidate mismatch between the intake, the ledger and the catalog slice', () => {
  const drifted = structuredClone(provenanceLedger);
  drifted.items[0].itemId = 'start-a1-not-a-candidate';

  assert.throws(() => build({ provenanceLedger: drifted }), /candidate id sets/i);
});
