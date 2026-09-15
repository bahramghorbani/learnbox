import test from 'node:test';
import assert from 'node:assert/strict';

import { buildStart35FinalPrivateMediaAttestation } from './build-start-35-final-private-media-attestation.mjs';

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
const receipt = () => ({
  batchId: manifest.batchId,
  state: 'private_upload_complete_not_attached',
  publicationBlocked: true,
  authentication: 'oidc',
  verification: { method: 'download-sha256', verifiedAssetCount: 105, cacheDisabled: true },
  assets: manifest.assets.map((asset) => ({
    ...asset,
    pathname: `learnbox-start/${asset.storageKey}.jpg`,
    mimeType: 'image/jpeg',
    size: 1,
    sha256: 'a'.repeat(64),
    verifiedBy: 'download-sha256',
    qaStatus: 'approved',
  })),
});

test('builds a 105-asset attachment attestation from the verified receipt', () => {
  const value = buildStart35FinalPrivateMediaAttestation(manifest, receipt());
  assert.equal(value.assets.length, 105);
  assert.equal(value.state, 'private_storage_verified_not_attached');
});

for (const [name, mutate] of [
  ['wrong batch', (value) => (value.batchId = 'wrong')],
  ['wrong verification count', (value) => (value.verification.verifiedAssetCount = 104)],
  ['missing receipt asset', (value) => value.assets.pop()],
  ['unapproved receipt asset', (value) => (value.assets[0].qaStatus = 'pending')],
  ['mismatched storage key', (value) => (value.assets[0].storageKey = 'wrong/image/v1')],
]) {
  test(`rejects ${name}`, () => {
    const value = receipt();
    mutate(value);
    assert.throws(
      () => buildStart35FinalPrivateMediaAttestation(manifest, value),
      /BUILD_REJECTED/,
    );
  });
}
