import { format, resolveConfig } from 'prettier';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readTrackedBlobDigests } from './tracked-git-blob-digests.mjs';
import {
  assertStart35FinalPrivateMediaAttachment,
  deriveStart35FinalPrivateMediaExposure,
  sha256,
  start35FinalPrivateMediaAttachmentPaths,
} from './validate-start-35-final-private-media-attachment.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const { attestationPath, manifestPath, recordPath } = start35FinalPrivateMediaAttachmentPaths;
const manifestUrl = new URL(`../${manifestPath}`, import.meta.url);
const attestationUrl = new URL(`../${attestationPath}`, import.meta.url);
const recordUrl = new URL(`../${recordPath}`, import.meta.url);
const assetKinds = ['image', 'word_audio', 'sentence_audio'];
const verificationMethod = 'sha256_equality_against_tracked_git_blobs';

function fail(message) {
  throw new Error(`START_35_FINAL_PRIVATE_MEDIA_ATTACHMENT_BUILD_REJECTED: ${message}`);
}

function assembleAttachmentRecord({ manifest, attestation, sourceDigests, trackedDigests }) {
  if (!manifest || !attestation) throw new Error('canonical manifest and attestation are required');
  if (trackedDigests === undefined) throw new Error('tracked Git blob digests are required');
  const exposure = deriveStart35FinalPrivateMediaExposure(attestation, trackedDigests);
  const contentIdCount = new Set(attestation.assets.map((asset) => asset.contentId)).size;
  return {
    recordVersion: 1,
    recordKind: 'canonical_repository_private_media_attachment_record',
    batchId: manifest.batchId,
    state: 'private_media_attached',
    attachmentScope: 'repository_evidence_only',
    publicationBlocked: true,
    learnerDeliveryActivated: false,
    databaseMediaRowsWritten: false,
    providerCallPerformed: false,
    authorization: {
      basis: 'owner_authorized_repository_attachment_record',
      identityIndependentlyVerified: false,
      authorizes: ['record_repository_attachment_state'],
      doesNotAuthorize: [
        'admin_outcome_persistence',
        'database_media_rows',
        'provider_operation',
        'learner_delivery_activation',
        'catalog_seed',
        'deployment',
        'publication',
      ],
    },
    counts: {
      itemCount: contentIdCount,
      assetCount: attestation.assets.length,
      contentIdCount,
      assetsByKind: Object.fromEntries(
        assetKinds.map((kind) => [
          kind,
          attestation.assets.filter((asset) => asset.kind === kind).length,
        ]),
      ),
    },
    sourceArtifacts: {
      manifest: {
        path: manifestPath,
        sha256: sourceDigests?.manifest ?? '',
        state: manifest.state,
      },
      attestation: {
        path: attestationPath,
        sha256: sourceDigests?.attestation ?? '',
        state: attestation.state,
      },
    },
    publicExposure: {
      classification: exposure.classification,
      verificationMethod,
      allAssetsPrivate: exposure.allAssetsPrivate,
      assetsWithPublicByteIdenticalCopy: exposure.assetsWithPublicByteIdenticalCopy,
      contentIdsWithPublicByteIdenticalCopy: exposure.contentIdsWithPublicByteIdenticalCopy,
      trackedPathsWithPublicByteIdenticalCopy: exposure.trackedPathsWithPublicByteIdenticalCopy,
      assetsWithoutPublicCopy: exposure.assetsWithoutPublicCopy,
      contentIdsWithoutPublicCopy: exposure.contentIdsWithoutPublicCopy,
      assetsWithPublicByteIdenticalCopyByKind: exposure.assetsWithPublicByteIdenticalCopyByKind,
    },
  };
}

/**
 * Derives the canonical attachment record from the immutable committed manifest, the immutable
 * committed attestation and the SHA-256 digests of tracked Git blobs. The record carries no
 * per-asset pathname, checksum, byte size or provider locator: only aggregate counts, the
 * exposed-copy truth and the digests anchoring both source artifacts.
 */
export function buildStart35FinalPrivateMediaAttachment(options = {}) {
  try {
    const record = assembleAttachmentRecord(options ?? {});
    assertStart35FinalPrivateMediaAttachment(record, options ?? {});
    return record;
  } catch (error) {
    fail(error.message);
  }
}

export async function buildCommittedStart35FinalPrivateMediaAttachment() {
  const [manifestText, attestationText] = await Promise.all([
    readFile(manifestUrl, 'utf8'),
    readFile(attestationUrl, 'utf8'),
  ]);
  const attestation = JSON.parse(attestationText);
  return buildStart35FinalPrivateMediaAttachment({
    manifest: JSON.parse(manifestText),
    attestation,
    sourceDigests: {
      manifest: sha256(manifestText),
      attestation: sha256(attestationText),
    },
    trackedDigests: await readTrackedBlobDigests({
      sizes: attestation.assets.map((asset) => asset.bytes),
      root: repositoryRoot,
    }),
  });
}

/**
 * Renders the record through the repository Prettier config, so the committed bytes stay stable and
 * keep matching `pnpm format:check`. Same approach as the canonical media manifest and review packet.
 */
export async function renderStart35FinalPrivateMediaAttachment(record) {
  return format(JSON.stringify(record), {
    ...(await resolveConfig(recordUrl.pathname)),
    filepath: recordUrl.pathname,
  });
}

export async function writeStart35FinalPrivateMediaAttachment({ write = false } = {}) {
  const record = await buildCommittedStart35FinalPrivateMediaAttachment();
  const serialized = await renderStart35FinalPrivateMediaAttachment(record);
  if (write) {
    await writeFile(recordUrl, serialized);
    console.info(
      `START_35_FINAL_PRIVATE_MEDIA_ATTACHMENT_WRITTEN assets=${record.counts.assetCount} state=${record.state} publication=blocked`,
    );
  } else if ((await readFile(recordUrl, 'utf8').catch(() => null)) !== serialized) {
    fail('the committed attachment record is stale or not deterministically reproducible');
  } else {
    console.info(
      `START_35_FINAL_PRIVATE_MEDIA_ATTACHMENT_CURRENT assets=${record.counts.assetCount} state=${record.state} publication=blocked`,
    );
  }
  return record;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await writeStart35FinalPrivateMediaAttachment({ write: process.argv.includes('--write') });
}
