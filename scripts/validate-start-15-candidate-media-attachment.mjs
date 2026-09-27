import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { buildStart15CandidateMediaAttachmentDraft } from './build-start-15-candidate-media-attachment-draft.mjs';

const contentRoot = new URL('../content/packs/learnbox-start/', import.meta.url);
const candidatesUrl = new URL(
  'validation/start-a1-catalog-35-pending-candidates.json',
  contentRoot,
);
const provenanceUrl = new URL(
  'validation/start-a1-catalog-35-pending-provenance-ledger.json',
  contentRoot,
);
const catalogSliceUrl = new URL('validation/start-a1-35-catalog-slice.json', contentRoot);
const draftUrl = new URL(
  'validation/start-a1-15-candidate-media-attachment-draft.json',
  contentRoot,
);
const environmentUrl = new URL('../.env.example', import.meta.url);

const assetCount = 45;
const allowedStatus = 'awaiting_private_upload';
// A preparation record must never carry private storage locations or the
// private package's checksum inventory.
const forbiddenFields = [
  'url',
  'pathname',
  'sha256',
  'checksum',
  'bytes',
  'size',
  'relativePath',
  'file',
];

function collectKeys(value, keys = []) {
  if (Array.isArray(value)) {
    for (const entry of value) collectKeys(entry, keys);
  } else if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      keys.push(key);
      collectKeys(entry, keys);
    }
  }
  return keys;
}

export function assertStart15CandidateMediaAttachmentPrepared(draft) {
  const blocked =
    draft.state === 'prepared_awaiting_private_upload' &&
    draft.publicationBlocked === true &&
    draft.attachmentAllowed === false &&
    draft.uploadPerformed === false &&
    draft.urlsIncluded === false &&
    draft.privatePackageInRepo === false &&
    draft.learnerExposure === false;
  if (!blocked) {
    throw new Error(
      'The candidate media preparation must stay default-off, upload-free and publication-blocked.',
    );
  }

  if (
    JSON.stringify(draft.recordedTranscriptionExceptions) !==
    JSON.stringify(['start-a1-essen-sentence', 'start-a1-gross-word'])
  ) {
    throw new Error('The preparation draft must retain both recorded transcription exceptions.');
  }

  const keys = new Set(collectKeys(draft));
  for (const field of forbiddenFields) {
    if (keys.has(field)) {
      throw new Error(`The preparation draft must not contain the forbidden field ${field}.`);
    }
  }

  if (!Array.isArray(draft.assets) || draft.assets.length !== assetCount) {
    throw new Error(`The preparation draft must describe exactly ${assetCount} candidate assets.`);
  }
  for (const asset of draft.assets) {
    if (asset.attachmentStatus !== allowedStatus) {
      throw new Error(
        `${asset.assetId ?? 'candidate asset'} must record attachmentStatus ${allowedStatus}, not ${asset.attachmentStatus}.`,
      );
    }
    if (asset.expectedMimeType !== (asset.kind === 'image' ? 'image/jpeg' : 'audio/mpeg')) {
      throw new Error(
        `${asset.assetId ?? 'candidate asset'} has an unexpected expected MIME type.`,
      );
    }
  }
}

export async function validateStart15CandidateMediaAttachment() {
  const [candidates, provenanceLedger, catalogSlice] = await Promise.all(
    [candidatesUrl, provenanceUrl, catalogSliceUrl].map((url) =>
      readFile(url, 'utf8').then(JSON.parse),
    ),
  );
  const expected = buildStart15CandidateMediaAttachmentDraft({
    candidates,
    provenanceLedger,
    catalogSlice,
  });
  const committed = JSON.parse(await readFile(draftUrl, 'utf8'));
  if (JSON.stringify(committed, null, 2) !== JSON.stringify(expected, null, 2)) {
    throw new Error(
      'The LB-DS-057 candidate media preparation draft is stale or drifted. Run pnpm build:start-15-candidate-attachment-draft.',
    );
  }
  assertStart15CandidateMediaAttachmentPrepared(committed);

  const environmentExample = await readFile(environmentUrl, 'utf8');

  for (const disabledDefault of [
    'NEXT_PUBLIC_LEARNBOX_PRIVATE_MEDIA_ENABLED=false',
    'LEARNBOX_PRIVATE_MEDIA_ATTACHMENT_ENABLED=false',
  ]) {
    if (!environmentExample.includes(disabledDefault)) {
      throw new Error(`Private media disabled default missing: ${disabledDefault}`);
    }
  }

  console.info(
    `START_15_CANDIDATE_ATTACHMENT_PREPARED_OK assets=${committed.assets.length} state=${committed.state} attached=0`,
  );
  return committed;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await validateStart15CandidateMediaAttachment();
}
