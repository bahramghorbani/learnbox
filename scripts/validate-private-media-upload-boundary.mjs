const attestationEntries = [
  ['version', 1],
  ['ownerApproved', true],
  ['targetPurpose', 'learnbox-private-media-isolated-nonproduction'],
  ['access', 'private'],
  ['dedicatedStore', true],
  ['dedicatedProject', true],
  ['productionConnectionAbsent', true],
  ['previewConnectionAbsent', true],
  ['sharedKnownStoreRejected', true],
  ['noExistingObjectsExpected', true],
];

function requiredIdentity(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required for private-media upload execution.`);
  }
  return value.trim();
}

export function validateUploadExecutionBoundary({
  execute,
  ownerApprovedFlag,
  attestation,
  resolvedStoreIdentity,
  expectedStoreIdentity,
  knownSharedStoreIdentity,
}) {
  if (!execute) return false;
  if (!ownerApprovedFlag) {
    throw new Error('The explicit owner approval flag is required for upload execution.');
  }
  if (!attestation || typeof attestation !== 'object' || Array.isArray(attestation)) {
    throw new Error('The local isolated-target attestation is required for upload execution.');
  }

  const expectedKeys = attestationEntries.map(([key]) => key).sort();
  const actualKeys = Object.keys(attestation).sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    expectedKeys.some((key, index) => actualKeys[index] !== key)
  ) {
    throw new Error('The isolated-target attestation must contain exactly the contract fields.');
  }
  for (const [key, expected] of attestationEntries) {
    if (attestation[key] !== expected) {
      throw new Error(
        `The isolated-target attestation field ${key} must equal ${JSON.stringify(expected)}.`,
      );
    }
  }

  const resolved = requiredIdentity(resolvedStoreIdentity, 'Resolved store identity');
  const expected = requiredIdentity(expectedStoreIdentity, 'Expected store identity');
  const knownShared = requiredIdentity(knownSharedStoreIdentity, 'Known shared store identity');

  if (resolved === knownShared || expected === knownShared) {
    throw new Error('The known shared target is rejected for private-media upload execution.');
  }
  if (resolved !== expected) {
    throw new Error(
      'The resolved runtime store identity does not match the expected isolated target.',
    );
  }
  return true;
}

export function createBlobCapabilityLoader(boundary, loadBlobCapabilities) {
  validateUploadExecutionBoundary(boundary);
  if (typeof loadBlobCapabilities !== 'function') {
    throw new TypeError('A Blob capability loader is required.');
  }
  return async () => loadBlobCapabilities();
}

if (import.meta.url === new URL(process.argv[1] ?? '', 'file:').href) {
  let loadCalls = 0;
  try {
    createBlobCapabilityLoader({ execute: true, ownerApprovedFlag: false }, async () => {
      loadCalls += 1;
    });
  } catch (error) {
    if (!(error instanceof Error) || !/owner approval/i.test(error.message) || loadCalls !== 0) {
      throw error;
    }
  }
  console.info('PRIVATE_MEDIA_UPLOAD_BOUNDARY_OK');
}
