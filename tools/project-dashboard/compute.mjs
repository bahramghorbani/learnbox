// Pure computations for the LearnBox local dashboard. No I/O, no globals that
// vary per call (new Date() lives in buildModel only). Unit-testable.
import {
  STATUS_TO_PERCENT,
  MAPPING_DOC,
  TASKS,
  RELEASE_CHECKLIST,
  STORYBOARD,
  ACTIVE_TASK_ID,
} from './config.mjs';

// Column assignment is status-based (blocked is "remaining", not "current").
const COMPLETED = new Set(['done', 'accepted']);
const CURRENT = new Set(['in-progress', 'review-requested']);

export function statusPercent(status, mapping = STATUS_TO_PERCENT) {
  if (status == null) return 0;
  const key = String(status).toLowerCase();
  if (!(key in mapping)) throw new Error(`Unknown task status: ${status}`);
  return mapping[key];
}

export function classifyTasks(tasks, mapping = STATUS_TO_PERCENT) {
  const completed = [];
  const current = [];
  const remaining = [];
  for (const t of tasks) {
    const s = String(t.status).toLowerCase();
    const row = { id: t.id, title: t.title, status: t.status, note: t.note, blocker: t.blocker };
    if (COMPLETED.has(s)) {
      row.percent = 100;
      completed.push(row);
    } else if (CURRENT.has(s)) {
      row.percent = mapping[s];
      current.push(row);
    } else {
      remaining.push(row);
    }
  }
  return { completed, current, remaining };
}

export function activeTaskPercent(task, mapping = STATUS_TO_PERCENT) {
  return statusPercent(task?.status, mapping);
}

export function releaseReadiness(checklist) {
  const totalWeight = checklist.reduce((s, i) => s + i.weight, 0);
  const achievedWeight = checklist.reduce((s, i) => s + (i.met ? i.weight : 0), 0);
  const percent = totalWeight === 0 ? 0 : Math.round((achievedWeight / totalWeight) * 10000) / 100;
  const blockers = checklist
    .filter((i) => !i.met)
    .map((i) => ({ id: i.id, label: i.label, weight: i.weight, evidence: i.evidence }));
  return {
    totalWeight,
    achievedWeight,
    percent,
    blockers,
    formula: 'Σ(weight of checked items) ÷ Σ(all weights) × 100',
    detail: `${achievedWeight} / ${totalWeight} × 100 = ${percent}%`,
  };
}

export function storyboardProgress(sb) {
  const percent = sb.stages === 0 ? 0 : Math.round((sb.currentStage / sb.stages) * 10000) / 100;
  return {
    currentStage: sb.currentStage,
    stages: sb.stages,
    percent,
    remaining: sb.stages - sb.currentStage,
  };
}

export function mergeLiveTasks(roadmapTasks, queueTasks, currentWork, git, prs) {
  const tasks = roadmapTasks.map((task) => ({ ...task }));

  for (const queued of queueTasks) {
    const existing = tasks.find((task) => task.id === queued.id);
    if (existing) {
      existing.status = queued.status;
      existing.note = 'وضعیت زنده از .ai/WORK_QUEUE.md';
    } else {
      tasks.push({
        id: queued.id,
        title: `تسک صف ${queued.id}`,
        status: queued.status,
        note: 'وضعیت زنده از .ai/WORK_QUEUE.md',
      });
    }
  }

  currentWork.forEach((item, index) => {
    const itemTitle = item.title.toLowerCase();
    const existing = tasks.find((task) => {
      const taskTitle = task.title.toLowerCase();
      return taskTitle.includes(itemTitle) || itemTitle.includes(taskTitle);
    });
    if (existing) {
      existing.status = 'not-started';
      existing.note = item.note;
    } else {
      tasks.push({
        id: `CURRENT-WORK-${index + 1}`,
        title: item.title,
        status: 'not-started',
        note: item.note,
      });
    }
  });

  const branch = git?.branch;
  for (const pr of [...prs].reverse()) {
    if (pr.branch === branch) continue;
    tasks.unshift({
      id: `OPEN-PR-${pr.number}`,
      title: `PR #${pr.number} — ${pr.title}`,
      status: 'review-requested',
      note: `${pr.isDraft ? 'Draft' : 'Open'} روی شاخه ${pr.branch}`,
    });
  }

  if (branch && branch !== 'main' && branch !== 'unknown') {
    const pr = prs.find((candidate) => candidate.branch === branch);
    tasks.unshift({
      id: 'CURRENT-BRANCH',
      title: `کار جاری روی شاخه ${branch}`,
      status: pr ? 'review-requested' : 'in-progress',
      note: pr
        ? `${pr.isDraft ? 'Draft PR' : 'PR'} #${pr.number} — ${pr.title}`
        : git?.status?.dirty
          ? `${git.status.changes} فایل تغییرکرده؛ هنوز PR باز نشده است.`
          : 'شاخه فعال است؛ هنوز PR باز نشده است.',
    });
  }

  return tasks;
}

export function buildModel(collectResult) {
  const { tasks, checklist, storyboard, activeTaskId, live } = collectResult;
  const columns = classifyTasks(tasks);
  const active = tasks.find((t) => t.id === activeTaskId) || columns.current[0] || tasks[0] || null;
  return {
    generatedAtIso: new Date().toISOString(),
    map: MAPPING_DOC.map((m) => ({ status: m.status, percent: m.percent })),
    columns,
    active: active
      ? {
          id: active.id,
          title: active.title,
          status: active.status,
          percent: statusPercent(active.status),
        }
      : null,
    activePercent: active ? statusPercent(active.status) : 0,
    release: releaseReadiness(checklist),
    storyboard: storyboardProgress(storyboard),
    live,
  };
}

export const DEFAULT_COLLECT = Object.freeze({
  tasks: TASKS,
  checklist: RELEASE_CHECKLIST,
  storyboard: STORYBOARD,
  activeTaskId: ACTIVE_TASK_ID,
});
