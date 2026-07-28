import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const websiteRequire = createRequire(resolve('apps/website/package.json'));
const { head, list, put } = await import(websiteRequire.resolve('@vercel/blob'));

const contentRoot = new URL('../content/packs/learnbox-start/', import.meta.url);
const draftFile = new URL('validation/start-a1-media-attachment-draft.json', contentRoot);
const localEnvPaths = [resolve('apps/website/.env.vercel.local'), resolve('.env.vercel.local')];
const receiptDirectory = '/Users/test/.codex/tmp/learnbox-vercel';
const receiptPath = `${receiptDirectory}/start-a1-private-upload-receipt.json`;
const execute = process.argv.includes('--execute');
const ownerApproved = process.argv.includes('--owner-approved');

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
  const token = localEnvironmentValue('BLOB_READ_WRITE_TOKEN');
  if (token) return { mode: 'read-write-token', token };

  const oidcToken = localEnvironmentValue('VERCEL_OIDC_TOKEN');
  const storeId = localEnvironmentValue('BLOB_STORE_ID');
  if (oidcToken && storeId) return { mode: 'oidc', oidcToken, storeId };

  throw new Error(
    'دسترسی خصوصی Vercel آماده نیست. ابتدا محیط توسعهٔ فروشگاه را با Vercel CLI روی همین دستگاه همگام‌سازی کنید.',
  );
}

const draft = JSON.parse(await readFile(draftFile, 'utf8'));
if (draft.state !== 'ready_for_private_storage_not_attached' || !draft.publicationBlocked) {
  throw new Error('The local attachment draft must remain private-storage-ready and blocked.');
}

if (execute && !ownerApproved) {
  throw new Error('بارگذاری واقعی فقط با تأیید صریح مالک اجرا می‌شود.');
}

const validatedAssets = await Promise.all(
  draft.assets.map(async (asset) => {
    const file = new URL(asset.localCandidate.relativePath, contentRoot);
    const bytes = await readFile(file);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== asset.localCandidate.sha256) {
      throw new Error(`اثر انگشت ${asset.assetId} با رسید آماده مطابقت ندارد.`);
    }
    const extension = asset.localCandidate.mimeType === 'image/png' ? 'png' : 'mp3';
    return { ...asset, bytes, pathname: `learnbox-start/${asset.storageKey}.${extension}` };
  }),
);

if (!execute) {
  console.info(
    `Dry run passed for ${validatedAssets.length} private media files; no token, upload or publication was used.`,
  );
  process.exit(0);
}

const credentials = blobCredentials();
const authentication =
  credentials.mode === 'oidc'
    ? { oidcToken: credentials.oidcToken, storeId: credentials.storeId }
    : { token: credentials.token };
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
  const priorUpload = existingByPathname.get(asset.pathname);
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
      mimeType: asset.localCandidate.mimeType,
      sha256: asset.localCandidate.sha256,
      qaStatus: 'approved',
      resumed: true,
    };
  }

  let blob;
  try {
    blob = await put(asset.pathname, asset.bytes, {
      access: 'private',
      addRandomSuffix: false,
      contentType: asset.localCandidate.mimeType,
      ...authentication,
    });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('already exists')) throw error;

    const concurrentlyUploaded = await head(asset.pathname, authentication);
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
      mimeType: asset.localCandidate.mimeType,
      sha256: asset.localCandidate.sha256,
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
    mimeType: asset.localCandidate.mimeType,
    sha256: asset.localCandidate.sha256,
    qaStatus: 'approved',
  };
}

const uploaded = new Array(validatedAssets.length);
let nextAssetIndex = 0;
const concurrency = 4;
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (nextAssetIndex < validatedAssets.length) {
      const assetIndex = nextAssetIndex++;
      uploaded[assetIndex] = await uploadOrResume(validatedAssets[assetIndex]);
    }
  }),
);

await mkdir(receiptDirectory, { recursive: true });
await writeFile(
  receiptPath,
  `${JSON.stringify(
    {
      batchId: draft.batchId,
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
