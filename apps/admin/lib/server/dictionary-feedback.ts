// Reads the visitor feedback the landing appends (feedback.jsonl): searches that found nothing,
// grouped by word, and the newest error reports. Read-only; the landing owns the file.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type Miss = { q: string; count: number; last: string };
export type Report = { lemma: string; kind: string; note: string; at: string };
export type FeedbackSummary = {
  misses: Miss[];
  reports: Report[];
  missTotal: number;
  reportTotal: number;
};

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function readFeedback(
  dir: string,
  known: (words: string[]) => Set<string>,
  limits = { misses: 100, reports: 50 },
): FeedbackSummary {
  let text = '';
  try {
    text = readFileSync(join(dir, 'feedback.jsonl'), 'utf8');
  } catch {
    // nothing recorded yet
  }
  const misses = new Map<string, Miss>();
  const reports: Report[] = [];
  let missTotal = 0;
  for (const line of text.split('\n')) {
    if (!line) continue;
    let r: Record<string, unknown>;
    try {
      r = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const at = str(r.at);
    if (r.type === 'miss' && str(r.q)) {
      missTotal++;
      const key = str(r.q).toLocaleLowerCase('de');
      const m = misses.get(key);
      if (m) {
        m.count++;
        if (at > m.last) m.last = at;
      } else misses.set(key, { q: str(r.q), count: 1, last: at });
    } else if (r.type === 'report' && str(r.lemma))
      reports.push({ lemma: str(r.lemma), kind: str(r.kind), note: str(r.note), at });
  }
  const ranked = [...misses.values()].sort(
    (a, b) => b.count - a.count || (a.last < b.last ? 1 : -1),
  );
  // Words added and published since they were searched drop off the list.
  const have = known(ranked.slice(0, limits.misses * 3).map((m) => m.q));
  return {
    misses: ranked.filter((m) => !have.has(m.q)).slice(0, limits.misses),
    reports: reports.reverse().slice(0, limits.reports),
    missTotal,
    reportTotal: reports.length,
  };
}
