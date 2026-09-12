import { format, resolveConfig } from 'prettier';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

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
const outputUrl = new URL(
  'validation/start-a1-15-candidate-media-attachment-draft.json',
  contentRoot,
);

const candidateCount = 15;
const audioCount = 30;

// LB-DS-055 candidate images are JPEG; audio stays MPEG. Expected kinds only —
// no private path, hash, size or delivery URL is copied into the repository.
const kinds = [
  { kind: 'image', slug: 'image-v1', mimeType: 'image/jpeg' },
  { kind: 'word_audio', slug: 'word-audio-v1', mimeType: 'audio/mpeg' },
  { kind: 'sentence_audio', slug: 'sentence-audio-v1', mimeType: 'audio/mpeg' },
];

export function buildStart15CandidateMediaAttachmentDraft({
  candidates,
  provenanceLedger,
  catalogSlice,
}) {
  const intakeIds = candidates.candidates.map((candidate) => candidate.candidateId);
  if (intakeIds.length !== candidateCount || new Set(intakeIds).size !== candidateCount) {
    throw new Error(
      `The LB-DS-055 candidate intake must describe exactly ${candidateCount} unique items.`,
    );
  }

  const sliceIds = catalogSlice.pendingDraftedItemIds;
  const ledgerIds = provenanceLedger.items.map((item) => item.itemId);
  const idSets = [intakeIds, ledgerIds, sliceIds].map((ids) => [...ids].sort().join('\u0000'));
  if (new Set(idSets).size !== 1) {
    throw new Error(
      'LB-DS-055 candidate id sets disagree between intake, provenance ledger and catalog slice.',
    );
  }

  const media = provenanceLedger.candidateMedia;
  if (media.attachmentAllowed !== false) {
    throw new Error('The provenance ledger must keep attachmentAllowed false before any upload.');
  }
  if (media.inventory?.images !== candidateCount || media.inventory?.audio !== audioCount) {
    throw new Error(
      `The provenance ledger candidate inventory must stay ${candidateCount} images and ${audioCount} audio.`,
    );
  }
  if (catalogSlice.publicationBlocked !== true || catalogSlice.seedDecision?.seedable !== false) {
    throw new Error('The catalog slice must remain publication-blocked and non-seedable.');
  }

  return {
    batchId: 'learnbox-start-a1-15-candidate-media-v1',
    state: 'prepared_awaiting_private_upload',
    publicationBlocked: true,
    attachmentAllowed: false,
    uploadPerformed: false,
    urlsIncluded: false,
    privatePackageInRepo: false,
    learnerExposure: false,
    purpose:
      'Default-off preparation record for the 15 LB-DS-055 candidate items. It declares the expected asset kinds and MIME types only: no private path, checksum, size or delivery URL is copied into the repository, and nothing is uploaded, attached, seeded or exposed.',
    sourceReferences: {
      intake: 'validation/start-a1-catalog-35-pending-candidates.json',
      provenanceLedger: 'validation/start-a1-catalog-35-pending-provenance-ledger.json',
      catalogSlice: 'validation/start-a1-35-catalog-slice.json',
    },
    requiredBeforeUpload: [
      'owner-approved-isolated-private-storage-target',
      'private_package_checksum_match',
    ],
    recordedTranscriptionExceptions: ['start-a1-essen-sentence', 'start-a1-gross-word'],
    assets: intakeIds.flatMap((contentId) =>
      kinds.map(({ kind, slug, mimeType }) => ({
        assetId: `${contentId}-${slug}`,
        contentId,
        kind,
        storageKey: `${contentId}/${kind}/v1`,
        expectedMimeType: mimeType,
        attachmentStatus: 'awaiting_private_upload',
      })),
    ),
  };
}

export async function validateStart15CandidateMediaAttachmentDraft({ write = false } = {}) {
  const [candidates, provenanceLedger, catalogSlice] = await Promise.all(
    [candidatesUrl, provenanceUrl, catalogSliceUrl].map((url) =>
      readFile(url, 'utf8').then(JSON.parse),
    ),
  );
  const draft = buildStart15CandidateMediaAttachmentDraft({
    candidates,
    provenanceLedger,
    catalogSlice,
  });
  const serialized = await format(JSON.stringify(draft), {
    ...(await resolveConfig(outputUrl.pathname)),
    filepath: outputUrl.pathname,
  });

  if (write) {
    await writeFile(outputUrl, serialized);
    console.info(
      'LB-DS-057 candidate media preparation draft written; no upload, attachment, seed or flag change was performed.',
    );
  } else if ((await readFile(outputUrl, 'utf8')) !== serialized) {
    throw new Error(
      'LB-DS-057 candidate media preparation draft is stale. Run pnpm build:start-15-candidate-attachment-draft.',
    );
  } else {
    console.info('LB-DS-057 candidate media preparation draft is current and remains unuploaded.');
  }

  return draft;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await validateStart15CandidateMediaAttachmentDraft({ write: process.argv.includes('--write') });
}
