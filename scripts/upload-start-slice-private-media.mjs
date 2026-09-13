import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildStart35FinalMediaManifest } from './build-start-35-final-media-manifest.mjs';
import { createBlobCapabilityLoader } from './validate-private-media-upload-boundary.mjs';

const contentRoot = new URL('../content/packs/learnbox-start/', import.meta.url);
const localEnvPaths = [
  resolve('apps/website/.env.vercel.local'),
  resolve('.env.vercel.local'),
  resolve('.env.local'),
];
const receiptDirectory = '/Users/test/.codex/tmp/learnbox-vercel';
const final35Flag = '--final-35';
const final35AssetCount = 105;
const final35ItemCount = 35;
const final35ReceiptPath = `${receiptDirectory}/start-a1-35-final-private-upload-receipt.json`;
const finalManifestFile = 'validation/start-a1-35-final-media-manifest.json';
const final35SourceFiles = {
  originalV2Images: 'validation/start-a1-v2-image-attachment-draft.json',
  originalV1Audio: 'validation/start-a1-media-attachment-draft.json',
  finalCandidatePackage: 'validation/start-a1-15-candidate-media-attachment-draft.json',
  catalogSlice: 'validation/start-a1-35-catalog-slice.json',
};
const provenanceLedgerFile = 'validation/start-a1-catalog-35-pending-provenance-ledger.json';
const itemMediaDirectory = { image: 'images', word_audio: 'audio', sentence_audio: 'audio' };
const mimeTypeExtension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'audio/mpeg': 'mp3' };
const expectedKindCounts = { image: 35, word_audio: 35, sentence_audio: 35 };
const expectedGenerationCounts = { 'v2-image': 20, 'v1-audio': 40, 'final-15-candidate': 45 };
const finalPackageRootFlag = '--final-package-root';
const expectedHumanReviewApprovals = 45;
// The immutable private package names each evidence file; the ledger anchors it.
const privatePackageEvidenceFiles = {
  manifestSha256: 'generation-manifest.json',
  transcriptionQaSha256: 'audio-transcription-qa.json',
  humanReviewSha256: 'human-review-final.json',
};
const reviewSuffixByKind = { image: 'image', word_audio: 'word', sentence_audio: 'sentence' };
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpegSignature = Buffer.from([0xff, 0xd8, 0xff]);
const id3Signature = Buffer.from([0x49, 0x44, 0x33]);
const sourceFilenamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

// Accepts either the repository content-root URL or a filesystem directory, so
// callers (and tests) can point preflight at another media directory.
const mediaFile = (root, relativePath) =>
  resolve(root instanceof URL ? fileURLToPath(root) : root, relativePath);

export function parseMode(argv) {
  const v2Images = argv.includes('--v2-images');
  const final35 = argv.includes(final35Flag);
  if (v2Images && final35) {
    throw new Error(
      `Exactly one private-media selection mode may be requested: do not combine ${final35Flag} with --v2-images.`,
    );
  }
  if (final35) return 'final-35';
  return v2Images ? 'v2-images' : 'original-60';
}

export function parseFinalPackageRoot(argv) {
  const index = argv.indexOf(finalPackageRootFlag);
  if (index === -1) return undefined;

  const value = argv[index + 1];
  if (typeof value !== 'string' || value.startsWith('--') || !isAbsolute(value)) {
    throw new Error(
      `${finalPackageRootFlag} requires an absolute path to the immutable private candidate package.`,
    );
  }
  return value;
}

export function extensionForMimeType(mimeType) {
  const extension = mimeTypeExtension[mimeType];
  if (!extension) {
    throw new Error(`Unsupported private-media MIME type ${String(mimeType)}.`);
  }
  return extension;
}

export function destinationPathname(storageKey, mimeType) {
  return `learnbox-start/${storageKey}.${extensionForMimeType(mimeType)}`;
}

// Real content signature sniffing for the three private-media MIME types.
export function detectMediaSignature(bytes) {
  if (bytes.length >= pngSignature.length && bytes.subarray(0, 8).equals(pngSignature)) {
    return 'image/png';
  }
  if (bytes.length >= jpegSignature.length && bytes.subarray(0, 3).equals(jpegSignature)) {
    return 'image/jpeg';
  }
  if (bytes.length >= id3Signature.length && bytes.subarray(0, 3).equals(id3Signature)) {
    return 'audio/mpeg';
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return 'audio/mpeg';
  }
  return undefined;
}

export function assertMediaSignature(bytes, declaredMimeType, label) {
  const detected = detectMediaSignature(bytes);
  if (detected !== declaredMimeType) {
    throw new Error(
      `${label} declares ${declaredMimeType} but its content bytes are ${detected ?? 'an unrecognised media signature'}.`,
    );
  }
  return detected;
}

// Resolves one final-15 repository asset to its immutable private-package
// candidate by content id and kind. The generation manifest is the only source
// of the filename, byte count and checksum; a rejected candidate is never used.
export function resolveFinal15Source(asset, generationManifest) {
  const { images, audio } = generationManifest ?? {};
  if (!Array.isArray(images) || !Array.isArray(audio)) {
    throw new Error(
      'The private package generation manifest must declare its image and audio candidates.',
    );
  }

  let matches;
  if (asset.kind === 'image') {
    matches = images.filter((entry) => entry?.contentId === asset.contentId);
  } else {
    const suffix = reviewSuffixByKind[asset.kind];
    if (!suffix) {
      throw new Error(`${asset.assetId} has an unexpected asset kind ${asset.kind}.`);
    }
    matches = audio.filter(
      (entry) => entry?.id === `${asset.contentId}-${suffix}` && entry?.kind === suffix,
    );
  }
  if (matches.length !== 1) {
    throw new Error(
      `${asset.assetId} must resolve to exactly one private-package candidate; found ${matches.length}.`,
    );
  }

  const [entry] = matches;
  const filename = entry.filename;
  if (
    typeof filename !== 'string' ||
    !sourceFilenamePattern.test(filename) ||
    filename.includes('..')
  ) {
    throw new Error(
      `${asset.assetId} has an unsafe private-package filename ${JSON.stringify(filename)}.`,
    );
  }
  if (/rejected/i.test(filename)) {
    throw new Error(
      `${asset.assetId} must never resolve to a rejected candidate file (${filename}).`,
    );
  }
  if (!filename.endsWith(`.${extensionForMimeType(asset.expectedMimeType)}`)) {
    throw new Error(
      `${asset.assetId} filename ${filename} does not agree with its declared MIME type ${asset.expectedMimeType}.`,
    );
  }
  if (!Number.isInteger(entry.bytes) || entry.bytes <= 0) {
    throw new Error(
      `${asset.assetId} private-package candidate ${filename} has no recorded byte count.`,
    );
  }
  if (typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256)) {
    throw new Error(
      `${asset.assetId} private-package candidate ${filename} has no recorded sha256.`,
    );
  }
  return { filename, bytes: entry.bytes, sha256: entry.sha256 };
}

export function assertHumanReviewApprovals(humanReview, ledger) {
  const review = humanReview?.review;
  if (!review || typeof review !== 'object' || Array.isArray(review)) {
    throw new Error('The private package human-review file must declare a review map.');
  }

  const mediaKeys = Object.keys(review).filter((key) => /-(?:image|word|sentence)$/.test(key));
  const notApproved = mediaKeys.filter((key) => review[key] !== 'approve');
  if (notApproved.length > 0) {
    throw new Error(
      `The private package human review must approve every media entry; ${notApproved[0]} is ${JSON.stringify(review[notApproved[0]])}.`,
    );
  }
  if (mediaKeys.length !== expectedHumanReviewApprovals) {
    throw new Error(
      `The private package human review must record exactly ${expectedHumanReviewApprovals} approved media entries, not ${mediaKeys.length}.`,
    );
  }

  const inventoryApproved = ledger?.candidateMedia?.inventory?.humanReviewApproved;
  if (inventoryApproved !== expectedHumanReviewApprovals) {
    throw new Error(
      `The repository provenance ledger must record exactly ${expectedHumanReviewApprovals} human-review approvals, not ${String(inventoryApproved)}.`,
    );
  }
  return mediaKeys;
}

// Reads the external immutable private package and refuses to resolve any
// final-15 asset until the three evidence files match the repository ledger.
export async function loadFinalPackage(root, ledger) {
  if (typeof root !== 'string' || !isAbsolute(root)) {
    throw new Error(
      `${finalPackageRootFlag} requires an absolute path to the immutable private candidate package.`,
    );
  }
  const evidence = ledger?.candidateMedia?.evidence;
  if (!evidence || typeof evidence !== 'object') {
    throw new Error(
      'The repository provenance ledger must declare the candidateMedia evidence checksums.',
    );
  }

  const buffers = new Map();
  for (const [key, name] of Object.entries(privatePackageEvidenceFiles)) {
    const expected = evidence[key];
    if (typeof expected !== 'string' || !/^[0-9a-f]{64}$/.test(expected)) {
      throw new Error(
        `The repository provenance ledger must declare the evidence checksum ${key}.`,
      );
    }
    const buffer = await readFile(join(root, name));
    const actual = createHash('sha256').update(buffer).digest('hex');
    if (actual !== expected) {
      throw new Error(`${name} evidence checksum does not match the repository ledger (${key}).`);
    }
    buffers.set(name, buffer);
  }

  const read = (name) => JSON.parse(buffers.get(name).toString('utf8'));
  const generationManifest = read('generation-manifest.json');
  const transcriptionQa = read('audio-transcription-qa.json');
  const humanReview = read('human-review-final.json');
  assertHumanReviewApprovals(humanReview, ledger);
  return { root, generationManifest, transcriptionQa, humanReview };
}

export function resolveSourceAsset(asset, { v2Images, v1Media, finalCandidates }) {
  const generations = [
    ['v2-image', v2Images],
    ['v1-audio', v1Media],
    ['final-15-candidate', finalCandidates],
  ];
  const matches = generations.flatMap(([generation, draft]) =>
    draft.assets
      .filter((candidate) => candidate.assetId === asset.assetId)
      .map((source) => ({ generation, source })),
  );
  if (matches.length !== 1) {
    throw new Error(
      `${asset.assetId} must resolve to exactly one source asset; found ${matches.length}.`,
    );
  }

  const [{ generation, source }] = matches;
  if (generation === 'v1-audio' && source.kind === 'image') {
    throw new Error(`The superseded V1 image ${asset.assetId} must never be selected.`);
  }
  return { generation, source };
}

export function assertFinal35SelectionIntegrity(assets) {
  if (!Array.isArray(assets) || assets.length !== final35AssetCount) {
    throw new Error(`The final-35 selection must contain exactly ${final35AssetCount} assets.`);
  }

  for (const [key, label] of [
    ['assetId', 'asset id'],
    ['storageKey', 'storage key'],
    ['relativePath', 'source path'],
  ]) {
    if (new Set(assets.map((asset) => asset[key])).size !== assets.length) {
      throw new Error(`The final-35 selection must not contain a duplicate ${label}.`);
    }
  }
  if (new Set(assets.map((asset) => asset.contentId)).size !== final35ItemCount) {
    throw new Error(
      `The final-35 selection must contain exactly ${final35ItemCount} unique content ids.`,
    );
  }

  const kindCounts = {};
  const generationCounts = {};
  for (const asset of assets) {
    kindCounts[asset.kind] = (kindCounts[asset.kind] ?? 0) + 1;
    generationCounts[asset.sourceGeneration] = (generationCounts[asset.sourceGeneration] ?? 0) + 1;

    const directory = itemMediaDirectory[asset.kind];
    if (!directory) {
      throw new Error(`${asset.assetId} has an unexpected asset kind ${asset.kind}.`);
    }
    const expectedFilename =
      asset.sourceGeneration === 'final-15-candidate'
        ? asset.sourceFilename
        : `${asset.assetId}.${extensionForMimeType(asset.expectedMimeType)}`;
    const expectedPath = `${directory}/${expectedFilename}`;
    if (typeof expectedFilename !== 'string' || asset.relativePath !== expectedPath) {
      throw new Error(
        `${asset.assetId} has a MIME type and file extension that do not agree (${asset.relativePath} vs ${expectedPath}).`,
      );
    }
    const expectedVersion = asset.sourceGeneration === 'v2-image' ? 'v2' : 'v1';
    if (asset.assetVersion !== expectedVersion) {
      throw new Error(`${asset.assetId} must stay on asset version ${expectedVersion}.`);
    }
    if (asset.storageKey !== `${asset.contentId}/${asset.kind}/${asset.assetVersion}`) {
      throw new Error(`${asset.assetId} has an unexpected storage key ${asset.storageKey}.`);
    }
  }

  for (const [kind, expected] of Object.entries(expectedKindCounts)) {
    if (kindCounts[kind] !== expected) {
      throw new Error(
        `The final-35 selection must select exactly ${expected} ${kind} assets, not ${kindCounts[kind] ?? 0}.`,
      );
    }
  }
  for (const [generation, expected] of Object.entries(expectedGenerationCounts)) {
    if (generationCounts[generation] !== expected) {
      throw new Error(
        `The final-35 selection must select exactly ${expected} ${generation} assets, not ${generationCounts[generation] ?? 0}.`,
      );
    }
  }
  if (Object.keys(generationCounts).length !== Object.keys(expectedGenerationCounts).length) {
    throw new Error('The final-35 selection contains an unexpected source generation.');
  }
  return true;
}

export async function loadFinal35Sources(root = contentRoot) {
  const read = (relativePath) => readFile(mediaFile(root, relativePath), 'utf8').then(JSON.parse);
  const [manifest, v2Images, v1Media, finalCandidates, catalogSlice, ledger] = await Promise.all([
    read(finalManifestFile),
    read(final35SourceFiles.originalV2Images),
    read(final35SourceFiles.originalV1Audio),
    read(final35SourceFiles.finalCandidatePackage),
    read(final35SourceFiles.catalogSlice),
    read(provenanceLedgerFile),
  ]);
  return { manifest, v2Images, v1Media, finalCandidates, catalogSlice, ledger };
}

export function deriveFinal35Selection(sources, finalPackage = {}) {
  const derived = buildStart35FinalMediaManifest(sources);
  if (JSON.stringify(derived) !== JSON.stringify(sources.manifest)) {
    throw new Error(
      'The committed final media manifest has drifted from its selection sources; run pnpm build:start-35-final-media-manifest before any private upload.',
    );
  }

  const superseded = new Set(sources.manifest.selection.supersededImageAssetIds);
  const selection = derived.assets.map((asset) => {
    if (superseded.has(asset.assetId)) {
      throw new Error(`The superseded V1 image ${asset.assetId} must never be selected.`);
    }

    const { generation, source } = resolveSourceAsset(asset, sources);
    if (source.kind !== asset.kind || source.storageKey !== asset.storageKey) {
      throw new Error(`${asset.assetId} does not match the selected kind and storage key.`);
    }

    const entry = {
      assetId: asset.assetId,
      contentId: asset.contentId,
      kind: asset.kind,
      assetVersion: asset.assetVersion,
      storageKey: asset.storageKey,
      expectedMimeType: asset.expectedMimeType,
      sourceGeneration: generation,
    };

    if (generation === 'final-15-candidate') {
      // The repository draft declares expected kinds and MIME types only. The
      // filename, byte count and checksum come from the external immutable
      // private package, and the human review must approve the entry.
      if (source.localCandidate) {
        throw new Error(`${asset.assetId} must not carry a local candidate record.`);
      }
      const reviewKey = `${asset.contentId}-${reviewSuffixByKind[asset.kind]}`;
      if (finalPackage.humanReview?.review?.[reviewKey] !== 'approve') {
        throw new Error(`${asset.assetId} is not approved in the private package human review.`);
      }
      const { filename, bytes, sha256 } = resolveFinal15Source(
        asset,
        finalPackage.generationManifest,
      );
      return {
        ...entry,
        relativePath: `${itemMediaDirectory[asset.kind]}/${filename}`,
        sourceFilename: filename,
        expectedBytes: bytes,
        expectedSha256: sha256,
      };
    }

    const candidate = source.localCandidate;
    if (!candidate) {
      throw new Error(`${asset.assetId} is missing its local candidate record.`);
    }
    if (candidate.mimeType !== asset.expectedMimeType) {
      throw new Error(
        `${asset.assetId} declares ${candidate.mimeType}, not ${asset.expectedMimeType}.`,
      );
    }
    const relativePath = `${itemMediaDirectory[asset.kind]}/${asset.assetId}.${extensionForMimeType(asset.expectedMimeType)}`;
    if (candidate.relativePath !== relativePath) {
      throw new Error(
        `${asset.assetId} candidate path ${candidate.relativePath} is not the deterministic media location ${relativePath}.`,
      );
    }
    return {
      ...entry,
      relativePath,
      expectedBytes: candidate.bytes,
      expectedSha256: candidate.sha256,
    };
  });

  assertFinal35SelectionIntegrity(selection);
  return selection;
}

export async function preflightFinal35Assets(
  assets,
  { contentRoot: repositoryRoot = contentRoot, packageRoot } = {},
) {
  assertFinal35SelectionIntegrity(assets);
  if (
    typeof packageRoot !== 'string' &&
    assets.some((asset) => asset.sourceGeneration === 'final-15-candidate')
  ) {
    throw new Error(
      `${finalPackageRootFlag} <absolute path> is required before the final-15 private package can be verified.`,
    );
  }

  const prepared = [];
  const missing = [];
  for (const asset of assets) {
    const root = asset.sourceGeneration === 'final-15-candidate' ? packageRoot : repositoryRoot;
    let bytes;
    try {
      bytes = await readFile(mediaFile(root, asset.relativePath));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      missing.push(asset.assetId);
      continue;
    }

    if (asset.expectedBytes !== undefined && bytes.byteLength !== asset.expectedBytes) {
      throw new Error(
        `${asset.assetId} holds ${bytes.byteLength} bytes but the source record expects ${asset.expectedBytes}.`,
      );
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (asset.expectedSha256 && sha256 !== asset.expectedSha256) {
      throw new Error(`${asset.assetId} sha256 does not match the recorded source checksum.`);
    }
    // Byte-level MIME agreement: the extension, the declared type and the real
    // content signature must all describe the same media before any capability load.
    assertMediaSignature(bytes, asset.expectedMimeType, asset.assetId);
    prepared.push({
      ...asset,
      bytes,
      sha256,
      destinationPathname: destinationPathname(asset.storageKey, asset.expectedMimeType),
    });
  }

  if (missing.length > 0) {
    throw new Error(`Missing ${missing.length} selected media files: ${missing.join(', ')}.`);
  }
  return prepared;
}

function localEnvironmentValue(key) {
  if (process.env[key]?.trim()) return process.env[key].trim();

  for (const localEnvPath of localEnvPaths) {
    if (!existsSync(localEnvPath)) continue;
    const line = readFileSync(localEnvPath, 'utf8')
      .split(/\r?\n/)
      .find((candidate) => candidate.startsWith(`${key}=`));
    if (!line) continue;

    const value = line
      .slice(`${key}=`.length)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    if (value) return value;
  }

  return undefined;
}

function blobCredentials() {
  const oidcToken = localEnvironmentValue('VERCEL_OIDC_TOKEN');
  const storeId = localEnvironmentValue('BLOB_STORE_ID');
  if (oidcToken && storeId) return { mode: 'oidc', oidcToken, storeId };

  throw new Error(
    'برای بارگذاری محلی فقط OIDC مدیریت‌شدهٔ Vercel همراه با شناسهٔ فروشگاه پذیرفته می‌شود.',
  );
}

async function prepareLegacyAssets(mode) {
  const draftFile = new URL(
    mode === 'v2-images'
      ? 'validation/start-a1-v2-image-attachment-draft.json'
      : 'validation/start-a1-media-attachment-draft.json',
    contentRoot,
  );
  const draft = JSON.parse(await readFile(draftFile, 'utf8'));
  if (draft.state !== 'ready_for_private_storage_not_attached' || !draft.publicationBlocked) {
    throw new Error('The local attachment draft must remain private-storage-ready and blocked.');
  }

  const prepared = await Promise.all(
    draft.assets.map(async (asset) => {
      const bytes = await readFile(new URL(asset.localCandidate.relativePath, contentRoot));
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      if (sha256 !== asset.localCandidate.sha256) {
        throw new Error(`اثر انگشت ${asset.assetId} با رسید آماده مطابقت ندارد.`);
      }
      return {
        assetId: asset.assetId,
        contentId: asset.contentId,
        kind: asset.kind,
        storageKey: asset.storageKey,
        mimeType: asset.localCandidate.mimeType,
        sha256,
        bytes,
        destinationPathname: destinationPathname(asset.storageKey, asset.localCandidate.mimeType),
      };
    }),
  );

  return {
    prepared,
    batchId: draft.batchId,
    receiptPath: `${receiptDirectory}/${
      mode === 'v2-images'
        ? 'start-a1-v2-images-private-upload-receipt'
        : 'start-a1-private-upload-receipt'
    }.json`,
  };
}

async function prepareFinal35Assets(finalPackageRoot) {
  const sources = await loadFinal35Sources();
  const finalPackage = await loadFinalPackage(finalPackageRoot, sources.ledger);
  const prepared = (
    await preflightFinal35Assets(deriveFinal35Selection(sources, finalPackage), {
      packageRoot: finalPackageRoot,
    })
  ).map((asset) => ({
    ...asset,
    mimeType: asset.expectedMimeType,
  }));
  return { prepared, batchId: sources.manifest.batchId, receiptPath: final35ReceiptPath };
}

async function main() {
  const argv = process.argv;
  const mode = parseMode(argv);
  const execute = argv.includes('--execute');
  const ownerApproved = argv.includes('--owner-approved');
  const attestationPath = resolve('.vercel/private-media-target-attestation.json');

  const finalPackageRoot = parseFinalPackageRoot(argv);
  if (mode === 'final-35' && !finalPackageRoot) {
    throw new Error(
      `${final35Flag} requires ${finalPackageRootFlag} <absolute path> to the immutable private candidate package.`,
    );
  }

  let attestation;
  if (execute) {
    try {
      attestation = JSON.parse(await readFile(attestationPath, 'utf8'));
    } catch (error) {
      throw new Error(`Local isolated-target attestation is required at ${attestationPath}.`, {
        cause: error,
      });
    }
  }

  const websiteRequire = createRequire(resolve('apps/website/package.json'));
  const loadBlobCapabilities = createBlobCapabilityLoader(
    {
      execute,
      ownerApprovedFlag: ownerApproved,
      attestation,
      resolvedStoreIdentity: execute ? localEnvironmentValue('BLOB_STORE_ID') : undefined,
      expectedStoreIdentity: execute
        ? localEnvironmentValue('LEARNBOX_PRIVATE_MEDIA_EXPECTED_STORE_ID')
        : undefined,
      knownSharedStoreIdentity: execute
        ? localEnvironmentValue('LEARNBOX_PRIVATE_MEDIA_KNOWN_SHARED_STORE_ID')
        : undefined,
    },
    async () => import(websiteRequire.resolve('@vercel/blob')),
  );

  // Every selected file is verified before the first provider capability load.
  const { prepared, batchId, receiptPath } =
    mode === 'final-35'
      ? await prepareFinal35Assets(finalPackageRoot)
      : await prepareLegacyAssets(mode);

  if (!execute) {
    console.info(
      `Dry run passed for ${prepared.length} private media files; no token, upload or publication was used.`,
    );
    return;
  }

  const credentials = blobCredentials();
  const { head, list, put } = await loadBlobCapabilities();
  const authentication = { oidcToken: credentials.oidcToken, storeId: credentials.storeId };
  const existing = await list({
    prefix: 'learnbox-start/',
    limit: 1000,
    ...authentication,
  });
  if (existing.hasMore) {
    throw new Error('فهرست رسانه‌های خصوصی بیش از حد انتظار طولانی است و باید دستی بررسی شود.');
  }
  const existingByPathname = new Map(existing.blobs.map((blob) => [blob.pathname, blob]));

  async function uploadOrResume(asset) {
    const priorUpload = existingByPathname.get(asset.destinationPathname);
    if (priorUpload) {
      if (priorUpload.size !== asset.bytes.byteLength) {
        throw new Error(`نسخهٔ موجود ${asset.assetId} با اندازهٔ فایل تأییدشده یکسان نیست.`);
      }
      console.info(`Validated existing private candidate: ${asset.assetId}`);
      return {
        assetId: asset.assetId,
        contentId: asset.contentId,
        kind: asset.kind,
        storageKey: asset.storageKey,
        pathname: priorUpload.pathname,
        url: priorUpload.url,
        mimeType: asset.mimeType,
        sha256: asset.sha256,
        qaStatus: 'approved',
        resumed: true,
      };
    }

    let blob;
    try {
      blob = await put(asset.destinationPathname, asset.bytes, {
        access: 'private',
        addRandomSuffix: false,
        contentType: asset.mimeType,
        ...authentication,
      });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('already exists')) throw error;

      const concurrentlyUploaded = await head(asset.destinationPathname, authentication);
      if (concurrentlyUploaded.size !== asset.bytes.byteLength) {
        throw new Error(`نسخهٔ هم‌زمان ${asset.assetId} با اندازهٔ فایل تأییدشده یکسان نیست.`);
      }
      console.info(`Validated concurrently uploaded private candidate: ${asset.assetId}`);
      return {
        assetId: asset.assetId,
        contentId: asset.contentId,
        kind: asset.kind,
        storageKey: asset.storageKey,
        pathname: concurrentlyUploaded.pathname,
        url: concurrentlyUploaded.url,
        mimeType: asset.mimeType,
        sha256: asset.sha256,
        qaStatus: 'approved',
        resumed: true,
      };
    }

    console.info(`Uploaded private candidate: ${asset.assetId}`);
    return {
      assetId: asset.assetId,
      contentId: asset.contentId,
      kind: asset.kind,
      storageKey: asset.storageKey,
      pathname: blob.pathname,
      url: blob.url,
      mimeType: asset.mimeType,
      sha256: asset.sha256,
      qaStatus: 'approved',
    };
  }

  const uploaded = new Array(prepared.length);
  let nextAssetIndex = 0;
  const concurrency = 4;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (nextAssetIndex < prepared.length) {
        const assetIndex = nextAssetIndex++;
        uploaded[assetIndex] = await uploadOrResume(prepared[assetIndex]);
      }
    }),
  );

  await mkdir(receiptDirectory, { recursive: true });
  await writeFile(
    receiptPath,
    `${JSON.stringify(
      {
        batchId,
        state: 'private_upload_complete_not_attached',
        publicationBlocked: true,
        authentication: credentials.mode,
        assets: uploaded,
      },
      null,
      2,
    )}\n`,
  );
  console.info(`Private upload receipt written outside the repository: ${receiptPath}`);
}

const isEntryPoint = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isEntryPoint) await main();
