// Read-only access to the active dictionary release file (ADR 0017). Server-only.
// The landing has no database credential; this file is its only data source.
import { existsSync } from 'node:fs';
import type { DatabaseSync as Db } from 'node:sqlite';

export type Article = 'der' | 'die' | 'das' | null;
export type Sense = { fa: string; hint: string };
export type Example = { de: string; fa: string | null };
export type CompoundPart = { text: string; lemma: string; article: Article; fa: string };
export type NounTable = {
  singular: ([string, string] | null)[];
  plural: ([string, string] | null)[];
};
export type VerbTable = { present: ([string, string] | null)[]; past: ([string, string] | null)[] };
export type Entry = {
  lemma: string;
  article: Article;
  pos: string | null;
  fa: string;
  freq: number;
  ipa: string | null;
  audio: string | null;
  syllables: string[] | null;
  senses: Sense[];
  phrases: { de: string; fa: string }[];
  table: NounTable | VerbTable | null;
  gram: [string, string][];
  examples: Example[];
  synonyms: string[];
  family: string[];
  compound: CompoundPart[] | null;
};
export type Hit = { lemma: string; article: Article; fa: string; freq: number; via: string | null };

let db: Db | null = null;

/** On only when the flag is set and the release file is mounted; otherwise every route is a 404. */
export function dictionaryEnabled() {
  const file = process.env.LEARNBOX_DICTIONARY_FILE;
  return (
    process.env.LEARNBOX_DICTIONARY_ENABLED === 'true' &&
    Boolean(file) &&
    existsSync(file as string)
  );
}

function open(): Db {
  if (db) return db;
  // getBuiltinModule keeps node:sqlite out of the bundler; it is part of the Node 22 runtime image.
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');
  db = new DatabaseSync(process.env.LEARNBOX_DICTIONARY_FILE as string, { readOnly: true });
  return db;
}

type Row = {
  lemma: string;
  article: Article;
  pos: string | null;
  fa: string;
  freq: number;
  data: string;
};
const toEntry = (r: Row): Entry => ({
  lemma: r.lemma,
  article: r.article,
  pos: r.pos,
  fa: r.fa,
  freq: r.freq,
  ...JSON.parse(r.data),
});

export function getEntry(lemma: string): Entry | null {
  const r = open().prepare('SELECT * FROM entry WHERE lemma = ?').get(lemma) as Row | undefined;
  return r ? toEntry(r) : null;
}

/** Where a URL that is not a headword should go: another casing, or the lemma of an inflected form. */
export function resolveLemma(word: string): string | null {
  const d = open();
  for (const w of variants(word)) {
    if (d.prepare('SELECT 1 FROM entry WHERE lemma = ?').get(w)) return w;
  }
  for (const w of variants(word)) {
    const r = d
      .prepare(
        'SELECT f.lemma FROM form f JOIN entry e ON e.lemma = f.lemma WHERE f.form = ? ORDER BY e.freq DESC LIMIT 1',
      )
      .get(w) as { lemma: string } | undefined;
    if (r) return r.lemma;
  }
  return null;
}

/** The subset of these words that have their own page, with their article. */
export function existing(words: string[]): { lemma: string; article: Article }[] {
  if (!words.length) return [];
  const rows = open()
    .prepare(`SELECT lemma, article FROM entry WHERE lemma IN (${words.map(() => '?').join(',')})`)
    .all(...words) as { lemma: string; article: Article }[];
  const order = new Map(words.map((w, i) => [w, i]));
  // node:sqlite rows have a null prototype; React only serialises plain objects to the client.
  return rows
    .map((r) => ({ lemma: r.lemma, article: r.article }))
    .sort((x, y) => order.get(x.lemma)! - order.get(y.lemma)!);
}

export function stats() {
  const d = open();
  const n = (d.prepare('SELECT COUNT(*) AS n FROM entry').get() as { n: number }).n;
  return { entries: n };
}

export function wordOfTheDay(date: Date): Entry {
  const d = open();
  // Common nouns with a real example sentence; the same word all day, a different one each day.
  const pool = d
    .prepare(
      "SELECT lemma FROM entry WHERE freq >= 3 AND article IS NOT NULL AND json_extract(data, '$.examples[0].fa') IS NOT NULL ORDER BY lemma",
    )
    .all() as { lemma: string }[];
  const day = Math.floor(date.getTime() / 86_400_000);
  return getEntry(pool[(day * 7919) % pool.length].lemma) as Entry;
}

/** Distractor meanings for the preview quiz: same part of speech, similar frequency, stable per word. */
export function distractors(entry: Entry, count: number): string[] {
  const rows = open()
    .prepare('SELECT fa FROM entry WHERE pos IS ? AND freq = ? AND lemma <> ? ORDER BY lemma')
    .all(entry.pos, entry.freq, entry.lemma) as { fa: string }[];
  const own = new Set(entry.senses.map((s) => s.fa.split('، ')[0]));
  const seed = [...entry.lemma].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const out: string[] = [];
  for (let i = 0; i < rows.length && out.length < count; i++) {
    const fa = rows[(seed + i * 104729) % rows.length].fa.split('، ')[0];
    if (!own.has(fa) && !out.includes(fa)) out.push(fa);
  }
  return out;
}

const HARAKAT = /[\u064B-\u0652\u0670]/g;
const isFa = (s: string) => /[\u0600-\u06FF]/.test(s);
const faKey = (s: string) =>
  s
    .replace(HARAKAT, '')
    .replace(/[ىي]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\s\u200c]+/g, ' ')
    .trim();
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
function variants(w: string) {
  const t = w.trim();
  return [...new Set([t, t[0]?.toUpperCase() + t.slice(1), t.toLowerCase()])].filter(Boolean);
}

export function search(raw: string, limit = 8): { head: string; hits: Hit[] } {
  const q = raw.trim().slice(0, 40);
  if (!q) return { head: '', hits: [] };
  const d = open();
  const score = new Map<string, { s: number; via: string | null }>();
  const add = (lemma: string, s: number, via: string | null = null) => {
    const cur = score.get(lemma);
    if (!cur || cur.s < s) score.set(lemma, { s, via });
  };

  if (isFa(q)) {
    const key = faKey(q);
    const rows = (
      key.length >= 3
        ? d
            .prepare('SELECT lemma, fa FROM search WHERE fa MATCH ? LIMIT 400')
            .all(`"${key.replace(/"/g, '')}"`)
        : d.prepare('SELECT lemma, fa FROM search WHERE fa LIKE ? LIMIT 400').all(`%${key}%`)
    ) as { lemma: string; fa: string }[];
    for (const r of rows) {
      const parts = r.fa.split(/ \| |، /);
      const s = parts.includes(key)
        ? 80
        : parts.some((p) => p.startsWith(key + ' ') || p.endsWith(' ' + key))
          ? 60
          : 30;
      add(r.lemma, s);
    }
  } else {
    for (const w of variants(q)) {
      if (d.prepare('SELECT 1 FROM entry WHERE lemma = ?').get(w)) add(w, 100);
      for (const r of d.prepare('SELECT lemma FROM form WHERE form = ?').all(w) as {
        lemma: string;
      }[])
        add(r.lemma, 90, `${w} ← شکل صرف‌شده`);
    }
    const f = fold(q);
    const rows = (
      f.length >= 3
        ? d
            .prepare('SELECT lemma FROM search WHERE de MATCH ? LIMIT 400')
            .all(`"${f.replace(/"/g, '')}"`)
        : d.prepare('SELECT lemma FROM entry WHERE lemma LIKE ? LIMIT 400').all(`${q}%`)
    ) as { lemma: string }[];
    for (const r of rows) add(r.lemma, fold(r.lemma).startsWith(f) ? 70 : 40);
  }

  const lemmas = [...score.keys()];
  if (!lemmas.length) return { head: '', hits: [] };
  const rows = d
    .prepare(
      `SELECT lemma, article, fa, freq FROM entry WHERE lemma IN (${lemmas.map(() => '?').join(',')})`,
    )
    .all(...lemmas) as Omit<Hit, 'via'>[];
  const hits = rows
    .map((r) => ({ ...r, via: score.get(r.lemma)!.via, s: score.get(r.lemma)!.s }))
    .sort((a, b) => b.s - a.s || b.freq - a.freq || a.lemma.length - b.lemma.length)
    .slice(0, limit)
    .map((h) => ({ lemma: h.lemma, article: h.article, fa: h.fa, freq: h.freq, via: h.via }));
  const head = isFa(q) ? 'فارسی به آلمانی' : hits[0]?.via ? 'شکل صرف‌شده پیدا شد' : 'نتیجه‌ها';
  return { head, hits };
}
