// Builds a new public dictionary release (SQLite, ADR 0017) from the live release plus the Admin
// editorial table. The live file is the base, so data the editor does not touch (forms, tables,
// audio, IPA, compounds) is kept; every approved panel entry overrides its word, every deleted one
// removes it. Nothing here talks to the database: the caller passes the editorial rows in.
import { copyFileSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export type ReleaseRow = {
  dictionaryKey: string;
  status: 'queued' | 'approved' | 'deleted';
  payload: Record<string, unknown>;
};
export type ReleaseCheck = { name: string; ok: boolean; detail?: string };
export type ReleaseReport = {
  entries: number;
  baseEntries: number;
  added: number;
  changed: number;
  deleted: number;
  skipped: { dictionaryKey: string; reason: string }[];
  checks: ReleaseCheck[];
  ok: boolean;
  bytes: number;
  sha256: string;
};

// Same normalisation the landing search uses (apps/learnbox-website/src/dictionary/store.ts).
const HARAKAT = /[\u064B-\u0652\u0670]/g;
export const faKey = (s: string) =>
  s
    .replace(HARAKAT, '')
    .replace(/[ىي]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\s\u200c]+/g, ' ')
    .trim();

const posAliases: Record<string, string> = {
  adverb: 'adv',
  adjective: 'adj',
  pronoun: 'pron',
  preposition: 'prep',
  conjunction: 'conj',
};
// Columns of the entry table, plus AI-draft-only fields that are not part of the release data.
const notData = new Set(['lemma', 'article', 'pos', 'freq', 'fa', 'example', 'skip', 'plural']);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

type Sqlite = typeof DatabaseSync;
type EntryRow = {
  lemma: string;
  article: string | null;
  pos: string | null;
  fa: string;
  freq: number;
  data: string;
};

/** The release entry an editorial row stands for, or why it cannot be published. */
export function releaseEntry(
  row: ReleaseRow,
  base: EntryRow | undefined,
): { entry: EntryRow } | { reason: string } {
  const p = row.payload;
  const lemma = row.dictionaryKey.trim();
  if (!lemma || lemma.length > 80 || lemma !== row.dictionaryKey)
    return { reason: 'invalid-lemma' };
  if (p.skip === true) return { reason: 'ai-skip' };
  const senses = (Array.isArray(p.senses) ? p.senses : [])
    .map((s) => ({
      fa: str((s as Record<string, unknown>)?.fa),
      hint: str((s as Record<string, unknown>)?.hint),
    }))
    .filter((s) => s.fa);
  if (!senses.length) return { reason: 'no-meaning' };
  const article = p.article === null || p.article === '' ? null : str(p.article);
  if (article !== null && !['der', 'die', 'das'].includes(article))
    return { reason: 'invalid-article' };
  const rawExamples = Array.isArray(p.examples) ? p.examples : p.example ? [p.example] : undefined;
  const baseData = base ? (JSON.parse(base.data) as Record<string, unknown>) : {};
  const data: Record<string, unknown> = { ...baseData };
  for (const [k, v] of Object.entries(p)) if (!notData.has(k)) data[k] = v;
  data.senses = senses;
  if (rawExamples)
    data.examples = rawExamples
      .map((e) => e as Record<string, unknown>)
      .filter((e) => str(e?.de))
      .map((e) => ({ de: str(e.de), fa: str(e.fa) || null }));
  for (const k of ['phrases', 'gram', 'synonyms', 'family'] as const)
    if (!Array.isArray(data[k])) data[k] = [];
  for (const k of ['ipa', 'audio', 'syllables', 'table', 'compound'] as const)
    if (data[k] === undefined) data[k] = null;
  if (!Array.isArray(data.examples)) data.examples = [];
  const pos = str(p.pos) || base?.pos || null;
  return {
    entry: {
      lemma,
      article,
      pos: pos ? (posAliases[pos] ?? pos) : null,
      fa: senses[0]!.fa,
      freq: base?.freq ?? (Number.isInteger(p.freq) ? (p.freq as number) : 1),
      data: JSON.stringify(data),
    },
  };
}

const same = (a: EntryRow, b: EntryRow) =>
  a.article === b.article &&
  a.pos === b.pos &&
  a.fa === b.fa &&
  a.freq === b.freq &&
  JSON.stringify(JSON.parse(a.data)) === b.data;

/** Copy `basePath` to `outPath`, apply the editorial rows, then verify the result. */
export function buildRelease(input: {
  sqlite: Sqlite;
  basePath: string;
  outPath: string;
  rows: ReleaseRow[];
  builtAt: string;
}): ReleaseReport {
  copyFileSync(input.basePath, input.outPath);
  const db = new input.sqlite(input.outPath);
  const report = { added: 0, changed: 0, deleted: 0, skipped: [] as ReleaseReport['skipped'] };
  let baseEntries = 0;
  try {
    baseEntries = (db.prepare('SELECT COUNT(*) AS n FROM entry').get() as { n: number }).n;
    const get = db.prepare('SELECT * FROM entry WHERE lemma = ?');
    const del = [
      db.prepare('DELETE FROM entry WHERE lemma = ?'),
      db.prepare('DELETE FROM form WHERE lemma = ?'),
      db.prepare('DELETE FROM search WHERE lemma = ?'),
    ];
    const upsert = db.prepare('INSERT OR REPLACE INTO entry VALUES (?, ?, ?, ?, ?, ?)');
    const insSearch = db.prepare('INSERT INTO search VALUES (?, ?, ?)');
    const delSearch = db.prepare('DELETE FROM search WHERE lemma = ?');
    const insForm = db.prepare('INSERT OR IGNORE INTO form VALUES (?, ?)');
    db.exec('BEGIN');
    for (const row of input.rows) {
      const base = get.get(row.dictionaryKey) as EntryRow | undefined;
      if (row.status === 'deleted') {
        if (base) {
          for (const s of del) s.run(row.dictionaryKey);
          report.deleted++;
        }
        continue;
      }
      // Queued rows are drafts the AI reviewer has not passed yet; they wait for the next release.
      if (row.status !== 'approved') continue;
      const result = releaseEntry(row, base);
      if ('reason' in result) {
        report.skipped.push({ dictionaryKey: row.dictionaryKey, reason: result.reason });
        continue;
      }
      const e = result.entry;
      if (base && same(base, e)) continue;
      upsert.run(e.lemma, e.article, e.pos, e.fa, e.freq, e.data);
      delSearch.run(e.lemma);
      const senses = (JSON.parse(e.data) as { senses: { fa: string }[] }).senses;
      insSearch.run(e.lemma, e.lemma, senses.map((s) => faKey(s.fa)).join(' | '));
      if (!base) {
        insForm.run(e.lemma, e.lemma);
        const plural = str(row.payload.plural);
        if (plural) insForm.run(plural, e.lemma);
      }
      if (base) report.changed++;
      else report.added++;
    }
    const stats = {
      entries: 0,
      added: report.added,
      changed: report.changed,
      deleted: report.deleted,
    };
    stats.entries = (db.prepare('SELECT COUNT(*) AS n FROM entry').get() as { n: number }).n;
    const sources = (
      db.prepare("SELECT value FROM meta WHERE key = 'sources'").get() as
        { value: string } | undefined
    )?.value;
    const upMeta = db.prepare('INSERT OR REPLACE INTO meta VALUES (?, ?)');
    upMeta.run('built_at', input.builtAt);
    upMeta.run('stats', JSON.stringify(stats));
    if (sources && !sources.includes('LearnBox editorial'))
      upMeta.run('sources', `${sources}; LearnBox editorial`);
    db.exec("COMMIT; INSERT INTO search(search) VALUES ('optimize'); VACUUM;");
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    db.close();
    throw error;
  }
  const checks = verifyRelease(db, baseEntries);
  db.close();
  const entries = Number(checks.find((c) => c.name === 'entries')?.detail ?? 0);
  return {
    ...report,
    entries,
    baseEntries,
    checks,
    ok: checks.every((c) => c.ok),
    bytes: statSync(input.outPath).size,
    sha256: createHash('sha256').update(readFileSync(input.outPath)).digest('hex'),
  };
}

/** Gates a release must pass before it can go live. */
export function verifyRelease(db: DatabaseSync, baseEntries: number): ReleaseCheck[] {
  const one = <T>(sql: string, ...args: string[]) => db.prepare(sql).get(...args) as T | undefined;
  const integrity = one<{ integrity_check: string }>('PRAGMA integrity_check')?.integrity_check;
  const entries = one<{ n: number }>('SELECT COUNT(*) AS n FROM entry')!.n;
  const indexed = one<{ n: number }>('SELECT COUNT(*) AS n FROM search')!.n;
  const empty = one<{ n: number }>("SELECT COUNT(*) AS n FROM entry WHERE trim(fa) = ''")!.n;
  const badJson = one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM entry WHERE json_valid(data) = 0 OR json_type(data, '$.senses') <> 'array'",
  )!.n;
  const de = one<{ lemma: string }>('SELECT lemma FROM entry WHERE lemma = ?', 'Haus');
  const fa = one<{ lemma: string }>('SELECT lemma FROM search WHERE fa MATCH ? LIMIT 1', '"خانه"');
  return [
    { name: 'integrity', ok: integrity === 'ok', detail: integrity },
    {
      name: 'entries',
      // A release never silently loses more than 2% of the dictionary.
      ok: entries >= Math.floor(baseEntries * 0.98) && entries > 0,
      detail: String(entries),
    },
    { name: 'search-index', ok: indexed === entries, detail: String(indexed) },
    { name: 'meanings', ok: empty === 0 && badJson === 0, detail: String(empty + badJson) },
    { name: 'search-de', ok: Boolean(de) },
    { name: 'search-fa', ok: Boolean(fa) },
  ];
}
