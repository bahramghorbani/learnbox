import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const requiredDocuments = [
  ['docs/PRODUCT_STATUS.md', ['# LearnBox product status', '## Capability inventory']],
  ['ROADMAP.md', ['# LearnBox release roadmap', '## Milestones']],
  [
    'docs/DOCUMENTATION_GOVERNANCE.md',
    ['# Documentation governance', '## Required PR declaration'],
  ],
  ['.ai/WORKSTREAMS.md', ['# LearnBox milestone workstreams', '## Worker roles']],
  ['.ai/WORK_QUEUE.md', ['## Active work registry', 'M0']],
  ['CURRENT_WORK.md', ['# LearnBox current work', '## Active work']],
];

export async function validateDocumentationGovernance(root = process.cwd()) {
  for (const [relativePath, markers] of requiredDocuments) {
    const content = await readFile(resolve(root, relativePath), 'utf8');
    const missing = markers.filter((marker) => !content.includes(marker));
    if (missing.length > 0) {
      throw new Error(`${relativePath} is missing: ${missing.join(', ')}`);
    }
  }

  const currentWork = await readFile(resolve(root, 'CURRENT_WORK.md'), 'utf8');
  if (/No unfinished implementation task is currently authorized/i.test(currentWork)) {
    throw new Error('CURRENT_WORK.md contains the stale empty-registry statement.');
  }

  const queue = await readFile(resolve(root, '.ai', 'WORK_QUEUE.md'), 'utf8');
  if (!/historical[\s\S]{0,180}not authorization/i.test(queue)) {
    throw new Error('WORK_QUEUE.md must distinguish active work from historical records.');
  }

  console.log(`DOCUMENTATION_GOVERNANCE_OK documents=${requiredDocuments.length}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await validateDocumentationGovernance();
}
