import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';

const contentRoot = new URL('../content/packs/learnbox-start/', import.meta.url);
const handoffFile = new URL('prompts/start-a1-slice-media-handoff.json', contentRoot);
const qaFile = new URL('validation/start-a1-candidate-qa.json', contentRoot);
const outputFile = new URL('validation/start-a1-media-attachment-draft.json', contentRoot);

const handoff = JSON.parse(await readFile(handoffFile, 'utf8'));
const qa = JSON.parse(await readFile(qaFile, 'utf8'));

if (
  handoff.state !== 'planning_only' ||
  handoff.providerRequestAllowed ||
  !handoff.publicationBlocked
) {
  throw new Error('The source handoff must remain planning-only and publication-blocked.');
}

if (qa.status !== 'candidate_qa_complete_not_released' || !qa.publicationBlocked) {
  throw new Error('A blocked candidate QA record is required before preparing attachment data.');
}

function localAsset(asset) {
  if (asset.kind === 'image') {
    return { relativePath: `images/${asset.contentId}-image-v1.png`, mimeType: 'image/png' };
  }
  if (asset.kind === 'word_audio') {
    return { relativePath: `audio/${asset.contentId}-word-audio-v1.mp3`, mimeType: 'audio/mpeg' };
  }
  return {
    relativePath: `audio/${asset.contentId}-sentence-audio-v1.mp3`,
    mimeType: 'audio/mpeg',
  };
}

const assets = await Promise.all(
  handoff.assets.map(async (asset) => {
    const local = localAsset(asset);
    const file = new URL(local.relativePath, contentRoot);
    const bytes = await readFile(file);
    const metadata = await stat(file);
    return {
      assetId: asset.assetId,
      contentId: asset.contentId,
      kind: asset.kind,
      storageKey: asset.storageKey,
      localCandidate: {
        relativePath: local.relativePath,
        mimeType: local.mimeType,
        bytes: metadata.size,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
      qaStatus: 'candidate_qa_passed',
      attachmentStatus: 'awaiting_private_storage_url',
    };
  }),
);

const draft = {
  batchId: handoff.batchId,
  state: 'ready_for_private_storage_not_attached',
  publicationBlocked: true,
  purpose:
    'Pre-upload integrity manifest only. It contains no public URL and is not a media receipt.',
  requiredBeforeAttachment: [
    'private_storage_url',
    'upload_checksum_match',
    'media_receipt_validation',
    'owner_release_approval',
  ],
  assets,
};

const serialized = `${JSON.stringify(draft, null, 2)}\n`;
if (process.argv.includes('--write')) {
  await writeFile(outputFile, serialized);
  console.info('Start A1 attachment draft written; no upload or publication was performed.');
} else if ((await readFile(outputFile, 'utf8')) !== serialized) {
  throw new Error('Start A1 attachment draft is stale. Run pnpm build:start-attachment-draft.');
} else {
  console.info('Start A1 attachment draft is current and remains upload-free.');
}
