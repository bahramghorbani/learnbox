import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { validateDocumentationGovernance } from './validate-documentation-governance.mjs';

const files = {
  'docs/PRODUCT_STATUS.md': '# LearnBox product status\n## Capability inventory\n',
  'ROADMAP.md': '# LearnBox release roadmap\n## Milestones\n',
  'docs/DOCUMENTATION_GOVERNANCE.md': '# Documentation governance\n## Required PR declaration\n',
  '.ai/WORKSTREAMS.md': '# LearnBox milestone workstreams\n## Worker roles\n',
  '.ai/WORK_QUEUE.md':
    '## Active work registry\nM0\nHistorical records remain for traceability; they are not authorization to duplicate.\n',
  'CURRENT_WORK.md': '# LearnBox current work\n## Active work\nM0 is in progress.\n',
};

async function fixture(overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'learnbox-doc-governance-'));
  for (const [relativePath, content] of Object.entries({ ...files, ...overrides })) {
    const absolutePath = join(root, relativePath);
    await mkdir(join(absolutePath, '..'), { recursive: true });
    await writeFile(absolutePath, content);
  }
  return root;
}

test('accepts canonical documents and active milestone state', async () => {
  await assert.doesNotReject(validateDocumentationGovernance(await fixture()));
});

test('rejects a missing governance marker', async () => {
  const root = await fixture({ 'ROADMAP.md': '# LearnBox release roadmap\n' });
  await assert.rejects(validateDocumentationGovernance(root), /ROADMAP\.md is missing/);
});

test('rejects stale empty current-work state', async () => {
  const root = await fixture({
    'CURRENT_WORK.md':
      '# LearnBox current work\n## Active work\nNo unfinished implementation task is currently authorized.\n',
  });
  await assert.rejects(validateDocumentationGovernance(root), /stale empty-registry/);
});

test('rejects a queue that does not separate historical records', async () => {
  const root = await fixture({ '.ai/WORK_QUEUE.md': '## Active work registry\nM0\n' });
  await assert.rejects(validateDocumentationGovernance(root), /historical records/);
});
