import { access, readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const taskHeader = /^## (LB-DS-\d{3})$/gm;
const allowedStatuses = new Set([
  'blocked',
  'ready',
  'in_progress',
  'review_requested',
  'accepted',
]);
const requiredTaskFields = [
  'Status',
  'Executor',
  'Base',
  'Branch',
  'Risk',
  'Specification',
  'Allowed paths',
  'Required checks',
  'Simulator required',
  'Draft PR required',
  'Merge allowed',
];
const requiredReportFields = [
  'Branch',
  'Base commit',
  'Head commit',
  'Draft PR',
  'Scope completed',
  'Files changed',
  'Checks run',
  'Checks unavailable',
  'Remaining work',
  'Risks',
  'Secrets or production changes',
  'Bobo canonical status',
];

function fields(block) {
  return new Map(
    [...block.matchAll(/^- ([^:\n]+):\s*(.+)$/gm)].map((match) => [
      match[1].trim(),
      match[2].trim(),
    ]),
  );
}

export async function validateAiWorkerQueue(root = process.cwd()) {
  const queue = await readFile(resolve(root, '.ai', 'WORK_QUEUE.md'), 'utf8');
  const matches = [...queue.matchAll(taskHeader)];
  const reportDirectory = resolve(root, '.ai', 'worker-reports');
  await access(reportDirectory);
  const reports = new Set(await readdir(reportDirectory));

  for (const [index, match] of matches.entries()) {
    const taskId = match[1];
    const block = queue.slice(match.index, matches[index + 1]?.index ?? queue.length);
    const task = fields(block);
    const missing = requiredTaskFields.filter((field) => !task.has(field));
    if (missing.length > 0) throw new Error(`${taskId} is missing fields: ${missing.join(', ')}`);
    if (!allowedStatuses.has(task.get('Status')))
      throw new Error(`${taskId} has an invalid status.`);
    if (task.get('Executor') !== 'deepseek-flash')
      throw new Error(`${taskId} executor must be deepseek-flash.`);
    if (task.get('Simulator required') !== 'no')
      throw new Error(`${taskId} simulator required must be no.`);
    if (task.get('Draft PR required') !== 'yes')
      throw new Error(`${taskId} Draft PR required must be yes.`);
    if (task.get('Merge allowed') !== 'no') throw new Error(`${taskId} merge allowed must be no.`);

    if (task.get('Status') === 'review_requested') {
      const reportName = `${taskId}.md`;
      if (!reports.has(reportName)) throw new Error(`${taskId} requires report ${reportName}.`);
      const report = fields(await readFile(resolve(reportDirectory, reportName), 'utf8'));
      const reportMissing = requiredReportFields.filter((field) => !report.has(field));
      if (reportMissing.length > 0)
        throw new Error(`${taskId} report is missing fields: ${reportMissing.join(', ')}`);
    }
  }

  console.log(`AI_WORKER_QUEUE_OK tasks=${matches.length}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await validateAiWorkerQueue();
