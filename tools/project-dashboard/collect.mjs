// Live data collection for the LearnBox dashboard. Pure parser functions are
// exported for testing; run() shells out to git/gh and is resilient to gh being
// offline (returns ghOffline, never throws).
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_COLLECT as DEFAULT_COMMITTED, mergeLiveTasks } from './compute.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd: ROOT, timeout: 8000 }, (err, stdout) => {
      resolve({ ok: !err, stdout: String(stdout), err });
    });
  });
}

// --- Pure parsers -------------------------------------------------------------
export function parseGitStatus(stdout) {
  const lines = stdout.split('\n').filter(Boolean);
  const branchLine = lines.find((l) => l.startsWith('##'));
  const branch = branchLine ? branchLine.replace('## ', '').split('...')[0] : 'unknown';
  const changes = lines.filter((l) => l && !l.startsWith('#')).length;
  return { branch, changes, dirty: changes > 0 };
}

export function parseGitLog(stdout) {
  return stdout
    .split('\n')
    .filter(Boolean)
    .map((l) => l.replace(/^\S+\s+/, '').trim())
    .filter(Boolean);
}

export function parseGhPrList(stdout) {
  try {
    const rows = JSON.parse(stdout);
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((row) => row && typeof row === 'object')
      .map((row) => ({
        number: row.number,
        title: row.title,
        branch: row.headRefName,
        isDraft: Boolean(row.isDraft),
        url: row.url,
      }));
  } catch {
    return [];
  }
}

export function parseWorkQueue(text) {
  const tasks = [];
  const re = /##\s+(LB-DS-\d+)(?:.|\n)*?-\s*Status:\s*([^\n`]+)/g;
  let m;
  while ((m = re.exec(text)) !== null)
    tasks.push({ id: m[1].trim(), status: m[2].trim().toLowerCase() });
  return tasks;
}

export function parseStoryboard(text) {
  const m = text.match(/\*\*Current stage:\*\*\s*(\d+)\s*of\s*(\d+)/);
  return m ? { currentStage: Number(m[1]), stages: Number(m[2]) } : null;
}

export function statusFromWorkQueue(text) {
  return new Map(parseWorkQueue(text).map((t) => [t.id, t.status]));
}

export function parseCurrentWork(text) {
  const section = text.match(/### Not done[^\n]*\n([\s\S]*?)(?=\n##\s|$)/)?.[1] ?? '';
  return section
    .split('\n')
    .map((line) => line.match(/^- \*\*(.+?)\*\*\s*(.*)$/))
    .filter(Boolean)
    .map((match) => ({ title: match[1].trim(), note: match[2].trim() }));
}

// --- Live runner --------------------------------------------------------------
export async function collectAll(committed = DEFAULT_COMMITTED) {
  const [status, log, branch, pr] = await Promise.all([
    run('git', ['status', '--short', '--branch']),
    run('git', ['log', '-6', '--oneline']),
    run('git', ['branch', '--show-current']),
    run('gh', [
      'pr',
      'list',
      '--state',
      'open',
      '--limit',
      '20',
      '--json',
      'number,title,headRefName,isDraft,url',
    ]),
  ]);

  const live = {
    git: {
      branch:
        branch.ok && branch.stdout.trim()
          ? branch.stdout.trim()
          : parseGitStatus(status.stdout).branch,
      status: status.ok ? parseGitStatus(status.stdout) : { error: 'git unavailable' },
      log: log.ok ? parseGitLog(log.stdout) : [],
    },
    prs: pr.ok ? parseGhPrList(pr.stdout) : [],
    ghOffline: !pr.ok,
    ghError: pr.ok ? null : pr.err?.message || String(pr.err?.code ?? 'unknown'),
  };

  // Live repo-file override for storyboard stage (falls back to committed value).
  let storyboard = committed.storyboard;
  try {
    const raw = readFileSync(join(ROOT, 'docs/storyboard/STATUS.md'), 'utf8');
    const parsed = parseStoryboard(raw);
    if (parsed) storyboard = parsed;
  } catch {
    /* file missing -> use committed fallback */
  }

  let queueTasks = [];
  let currentWork = [];
  try {
    queueTasks = parseWorkQueue(readFileSync(join(ROOT, '.ai/WORK_QUEUE.md'), 'utf8'));
  } catch {
    /* missing queue -> committed roadmap remains available */
  }
  try {
    currentWork = parseCurrentWork(readFileSync(join(ROOT, 'CURRENT_WORK.md'), 'utf8'));
  } catch {
    /* missing work registry -> committed roadmap remains available */
  }

  return {
    tasks: mergeLiveTasks(committed.tasks, queueTasks, currentWork, live.git, live.prs),
    checklist: committed.checklist,
    storyboard,
    activeTaskId: committed.activeTaskId,
    live,
  };
}
