import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBlobCapabilityLoader,
  validateUploadExecutionBoundary,
} from './validate-private-media-upload-boundary.mjs';

const validAttestation = {
  version: 1,
  ownerApproved: true,
  targetPurpose: 'learnbox-private-media-isolated-nonproduction',
  access: 'private',
  dedicatedStore: true,
  dedicatedProject: true,
  productionConnectionAbsent: true,
  previewConnectionAbsent: true,
  sharedKnownStoreRejected: true,
  noExistingObjectsExpected: true,
};

const validBoundary = {
  execute: true,
  ownerApprovedFlag: true,
  attestation: validAttestation,
  resolvedStoreIdentity: 'runtime-isolated-target',
  expectedStoreIdentity: 'runtime-isolated-target',
  knownSharedStoreIdentity: 'known-shared-target',
};

test('dry run does not require an execution attestation', () => {
  assert.equal(validateUploadExecutionBoundary({ execute: false }), false);
});

test('execute rejects a missing owner approval flag', () => {
  assert.throws(
    () => validateUploadExecutionBoundary({ ...validBoundary, ownerApprovedFlag: false }),
    /owner approval flag/i,
  );
});

test('execute rejects a missing attestation', () => {
  assert.throws(
    () => validateUploadExecutionBoundary({ ...validBoundary, attestation: undefined }),
    /attestation.*required/i,
  );
});

test('execute rejects malformed or extra attestation fields', () => {
  assert.throws(
    () =>
      validateUploadExecutionBoundary({
        ...validBoundary,
        attestation: { ...validAttestation, unexpected: true },
      }),
    /exact(?:ly)? .*fields/i,
  );
  assert.throws(
    () =>
      validateUploadExecutionBoundary({
        ...validBoundary,
        attestation: { ...validAttestation, dedicatedStore: false },
      }),
    /dedicatedStore/i,
  );
});

test('execute rejects missing and mismatched runtime identities', () => {
  assert.throws(
    () =>
      validateUploadExecutionBoundary({
        ...validBoundary,
        expectedStoreIdentity: undefined,
      }),
    /expected store identity/i,
  );
  assert.throws(
    () =>
      validateUploadExecutionBoundary({
        ...validBoundary,
        resolvedStoreIdentity: 'different-target',
      }),
    /does not match/i,
  );
});

test('execute rejects the known shared target marker', () => {
  assert.throws(
    () =>
      validateUploadExecutionBoundary({
        ...validBoundary,
        resolvedStoreIdentity: 'known-shared-target',
        expectedStoreIdentity: 'known-shared-target',
      }),
    /known shared target/i,
  );
});

test('execute accepts the exact fields independent of JSON key order', () => {
  const reorderedAttestation = Object.fromEntries(Object.entries(validAttestation).reverse());
  assert.equal(
    validateUploadExecutionBoundary({ ...validBoundary, attestation: reorderedAttestation }),
    true,
  );
});

test('execute accepts the exact isolated target boundary', () => {
  assert.equal(validateUploadExecutionBoundary(validBoundary), true);
});

test('uploader validates the boundary before loading Blob capabilities', async () => {
  let loadCalls = 0;
  assert.throws(
    () =>
      createBlobCapabilityLoader(
        { ...validBoundary, resolvedStoreIdentity: 'known-shared-target' },
        async () => {
          loadCalls += 1;
        },
      ),
    /known shared target/i,
  );
  assert.equal(loadCalls, 0);

  const loadBlobCapabilities = createBlobCapabilityLoader(validBoundary, async () => {
    loadCalls += 1;
    return { list() {}, head() {}, put() {} };
  });
  const capabilities = await loadBlobCapabilities();
  assert.deepEqual(Object.keys(capabilities).sort(), ['head', 'list', 'put']);
  assert.equal(loadCalls, 1);
});
