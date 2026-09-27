import test from 'node:test';
import assert from 'node:assert/strict';

import { assertStart35FinalPrivateMediaAttestation } from './validate-start-35-final-private-media-attestation.mjs';

const manifest = {
  batchId: 'learnbox-start-a1-35-final-media-v1',
  state: 'prepared_awaiting_private_upload',
  publicationBlocked: true,
  attachmentAllowed: false,
  uploadPerformed: false,
  urlsIncluded: false,
  privatePackageInRepo: false,
  learnerExposure: false,
  assets: Array.from({ length: 105 }, (_, index) => ({
    assetId: `start-a1-${index}-image-v1`,
    contentId: `start-a1-${index}`,
    kind: 'image',
    storageKey: `start-a1-${index}/image/v1`,
    expectedMimeType: 'image/jpeg',
  })),
};
const asset = (index) => ({
  ...manifest.assets[index],
  pathname: `learnbox-start/start-a1-${index}/image/v1.jpg`,
  mimeType: 'image/jpeg',
  bytes: 1,
  sha256: 'a'.repeat(64),
  attachmentStatus: 'verified_private_storage_not_attached',
});
const attestation = () => ({
  batchId: manifest.batchId,
  state: 'private_storage_verified_not_attached',
  publicationBlocked: true,
  assets: Array.from({ length: 105 }, (_, index) => asset(index)),
});

test('accepts the exact 105-asset private attachment record', () => {
  assert.equal(assertStart35FinalPrivateMediaAttestation(attestation(), manifest), true);
});

for (const [name, mutate] of [
  ['a receipt with a wrong batch', (value) => (value.batchId = 'wrong')],
  ['a receipt with an extra asset', (value) => value.assets.push(asset(0))],
  ['a receipt with a missing asset', (value) => value.assets.pop()],
  [
    'a receipt with malformed checksum evidence',
    (value) => (value.assets[0].sha256 = 'not-a-sha256'),
  ],
  [
    'a receipt with a mismatched pathname',
    (value) => (value.assets[0].pathname = 'learnbox-start/other.jpg'),
  ],
]) {
  test(`rejects ${name}`, () => {
    const value = attestation();
    mutate(value);
    assert.throws(
      () => assertStart35FinalPrivateMediaAttestation(value, manifest),
      /ATTESTATION_INVALID/,
    );
  });
}
