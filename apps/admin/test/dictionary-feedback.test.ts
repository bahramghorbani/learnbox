import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readFeedback } from '../lib/server/dictionary-feedback';
import { DictionaryReleasePublisher } from '../lib/server/dictionary-release-publisher';

const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');
const lines = (rows: unknown[]) => rows.map((r) => JSON.stringify(r)).join('\n') + '\nnot json\n';

describe('dictionary feedback', () => {
  it('groups misses by word, drops words the live release has, newest reports first', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dict-fb-'));
    writeFileSync(
      join(dir, 'feedback.jsonl'),
      lines([
        { type: 'miss', q: 'Schmetterling', at: '2026-11-05T01:00:00Z' },
        { type: 'miss', q: 'schmetterling', at: '2026-11-05T03:00:00Z' },
        { type: 'miss', q: 'Haus', at: '2026-11-05T02:00:00Z' },
        { type: 'miss', q: 'Igel', at: '2026-11-05T02:00:00Z' },
        { type: 'report', lemma: 'Haus', kind: 'meaning', note: 'a', at: '2026-11-05T01:00:00Z' },
        { type: 'report', lemma: 'Katze', kind: 'other', note: '', at: '2026-11-05T02:00:00Z' },
      ]),
    );
    const summary = readFeedback(dir, (words) => new Set(words.filter((w) => w === 'Haus')));
    expect(summary.misses).toEqual([
      { q: 'Schmetterling', count: 2, last: '2026-11-05T03:00:00Z' },
      { q: 'Igel', count: 1, last: '2026-11-05T02:00:00Z' },
    ]);
    expect(summary.reports.map((r) => r.lemma)).toEqual(['Katze', 'Haus']);
    expect(summary).toMatchObject({ missTotal: 4, reportTotal: 2 });
    expect(readFeedback(mkdtempSync(join(tmpdir(), 'x-')), () => new Set())).toEqual({
      misses: [],
      reports: [],
      missTotal: 0,
      reportTotal: 0,
    });
  });

  it('knows words of the live release by headword or form, in any typed casing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dict-known-'));
    const db = new DatabaseSync(join(dir, 'dict-a.sqlite'));
    db.exec(`CREATE TABLE entry (lemma TEXT PRIMARY KEY) WITHOUT ROWID;
      CREATE TABLE form (form TEXT NOT NULL, lemma TEXT NOT NULL, PRIMARY KEY (form, lemma)) WITHOUT ROWID;
      INSERT INTO entry VALUES ('Haus'), ('gehen'); INSERT INTO form VALUES ('häuser', 'Haus'), ('ging', 'gehen');`);
    db.close();
    writeFileSync(join(dir, 'current.json'), JSON.stringify({ file: 'dict-a.sqlite' }));
    const known = new DictionaryReleasePublisher(dir, DatabaseSync).knownWords([
      'haus',
      'HÄUSER',
      'Ging',
      'Igel',
    ]);
    expect([...known]).toEqual(['haus', 'HÄUSER', 'Ging']);
  });
});
