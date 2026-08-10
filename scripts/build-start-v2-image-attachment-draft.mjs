import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';

const contentRoot = new URL('../content/packs/learnbox-start/', import.meta.url);
const contract = JSON.parse(
  await readFile(new URL('prompts/start-a1-v2-visual-contract.json', contentRoot), 'utf8'),
);
const qa = JSON.parse(
  await readFile(new URL('validation/start-a1-v2-candidate-qa.json', contentRoot), 'utf8'),
);
const outputFile = new URL('validation/start-a1-v2-image-attachment-draft.json', contentRoot);

if (qa.status !== 'candidate_qa_complete_not_released' || !qa.publicationBlocked) {
  throw new Error('A blocked V2 candidate QA record is required before preparing attachment data.');
}

const assets = await Promise.all(
  contract.cards.map(async ({ contentId }) => {
    const relativePath = `images/${contentId}-image-v2.png`;
    const file = new URL(relativePath, contentRoot);
    const bytes = await readFile(file);
    const metadata = await stat(file);
    return {
      assetId: `${contentId}-image-v2`,
      contentId,
      kind: 'image',
      storageKey: `${contentId}/image/v2`,
      localCandidate: {
        relativePath,
        mimeType: 'image/png',
        bytes: metadata.size,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
      qaStatus: 'candidate_qa_passed',
      attachmentStatus: 'awaiting_private_storage_url',
    };
  }),
);

const draft = {
  batchId: 'learnbox-start-a1-images-v2',
  state: 'ready_for_private_storage_not_attached',
  publicationBlocked: true,
  purpose: 'V2 image-only integrity manifest. Existing V1 audio remains unchanged and unpublished.',
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
  console.info(
    'Start A1 V2 image attachment draft written; no upload or publication was performed.',
  );
} else if ((await readFile(outputFile, 'utf8')) !== serialized) {
  throw new Error(
    'Start A1 V2 image attachment draft is stale. Run pnpm build:start-v2-image-attachment-draft.',
  );
} else {
  console.info('Start A1 V2 image attachment draft is current and remains upload-free.');
}
