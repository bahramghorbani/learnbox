import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { validateAiWorkerQueue } from './validate-ai-worker-queue.mjs';

async function fixture(queue, reports = {}) {
  const root = await mkdtemp(join(tmpdir(), 'learnbox-worker-queue-'));
  await mkdir(join(root, '.ai', 'worker-reports'), { recursive: true });
  await writeFile(join(root, '.ai', 'WORK_QUEUE.md'), queue);
  for (const [name, content] of Object.entries(reports)) {
    await writeFile(join(root, '.ai', 'worker-reports', name), content);
  }
  return root;
}

const validTask = `
## LB-DS-001
- Status: ready
- Executor: deepseek-flash
- Base: main
- Branch: worker/lb-ds-001-example
- Risk: routine
- Specification: docs/example.md
- Allowed paths: scripts/example.mjs; scripts/example.test.mjs
- Required checks: node --test scripts/example.test.mjs
- Simulator required: no
- Draft PR required: yes
- Merge allowed: no
`;

test('accepts a bounded ready task with no simulator requirement', async () => {
  const root = await fixture(validTask);
  await assert.doesNotReject(validateAiWorkerQueue(root));
});

test('rejects a DeepSeek task that requires simulator access or permits merge', async () => {
  const root = await fixture(
    validTask
      .replace('Simulator required: no', 'Simulator required: yes')
      .replace('Merge allowed: no', 'Merge allowed: yes'),
  );
  await assert.rejects(validateAiWorkerQueue(root), /simulator|required.*no|merge/i);
});

test('requires a standard report for a task marked review_requested', async () => {
  const root = await fixture(validTask.replace('Status: ready', 'Status: review_requested'));
  await assert.rejects(validateAiWorkerQueue(root), /LB-DS-001.*report/i);
});

test('accepts a complete report for review_requested work', async () => {
  const root = await fixture(validTask.replace('Status: ready', 'Status: review_requested'), {
    'LB-DS-001.md': `
# LB-DS-001 handoff
- Branch: worker/lb-ds-001-example
- Base commit: abc1234
- Head commit: def5678
- Draft PR: https://github.com/example/repo/pull/1
- Scope completed: example
- Files changed: scripts/example.mjs
- Checks run: node --test scripts/example.test.mjs — pass
- Checks unavailable: Flutter, Android Studio, emulator and physical device
- Remaining work: Codex review
- Risks: none known
- Secrets or production changes: none
- Bobo canonical status: unchanged
`,
  });
  await assert.doesNotReject(validateAiWorkerQueue(root));
});
