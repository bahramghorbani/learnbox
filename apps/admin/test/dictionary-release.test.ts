import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRelease, releaseEntry } from '../lib/server/dictionary-release-builder';
import { DictionaryReleasePublisher } from '../lib/server/dictionary-release-publisher';

const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');

const data = (fa: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    ipa: null,
    audio: null,
    syllables: null,
    senses: [{ fa, hint: '' }],
    phrases: [],
    table: null,
    gram: [],
    examples: [],
    synonyms: [],
    family: [],
    compound: null,
    ...extra,
  });

/** A release file shaped like build-release.mjs output, with `n` filler words. */
function fixture(dir: string, name: string, n = 50) {
  const path = join(dir, name);
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE entry (lemma TEXT PRIMARY KEY, article TEXT, pos TEXT, fa TEXT NOT NULL, freq INTEGER NOT NULL, data TEXT NOT NULL) WITHOUT ROWID;
    CREATE TABLE form (form TEXT NOT NULL, lemma TEXT NOT NULL, PRIMARY KEY (form, lemma)) WITHOUT ROWID;
    CREATE VIRTUAL TABLE search USING fts5(lemma UNINDEXED, de, fa, tokenize = 'trigram remove_diacritics 1');
    INSERT INTO meta VALUES ('sources', 'Wiktionary');
  `);
  const add = (lemma: string, article: string | null, fa: string, extra = {}) => {
    db.prepare('INSERT INTO entry VALUES (?, ?, ?, ?, ?, ?)').run(
      lemma,
      article,
      'noun',
      fa,
      5,
      data(fa, extra),
    );
    db.prepare('INSERT INTO search VALUES (?, ?, ?)').run(lemma, lemma, fa);
    db.prepare('INSERT INTO form VALUES (?, ?)').run(lemma, lemma);
  };
  add('Haus', 'das', 'خانه', { ipa: 'haʊ̯s', audio: 'haus.ogg' });
  add('Katze', 'die', 'گربه');
  for (let i = 0; i < n; i++) add(`Wort${i}`, 'das', `واژه ${i}`);
  db.close();
  return path;
}
const read = (path: string, lemma: string) => {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return db.prepare('SELECT * FROM entry WHERE lemma = ?').get(lemma) as
      { article: string; pos: string; fa: string; freq: number; data: string } | undefined;
  } finally {
    db.close();
  }
};

describe('dictionary release builder', () => {
  it('overlays approved edits on the live release and keeps untouched data', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dict-build-'));
    const base = fixture(dir, 'dict-base.sqlite');
    const out = join(dir, 'dict-new.sqlite');
    const report = buildRelease({
      sqlite: DatabaseSync,
      basePath: base,
      outPath: out,
      builtAt: '2026-11-05T10:00:00.000Z',
      rows: [
        {
          dictionaryKey: 'Haus',
          status: 'approved',
          payload: {
            lemma: 'Haus',
            article: 'das',
            pos: 'noun',
            senses: [{ fa: 'خانه، منزل', hint: '' }],
            examples: [{ de: 'Das Haus ist groß.', fa: 'خانه بزرگ است.' }],
          },
        },
        { dictionaryKey: 'Katze', status: 'deleted', payload: { lemma: 'Katze', senses: [] } },
        {
          dictionaryKey: 'daran',
          status: 'approved',
          payload: {
            lemma: 'daran',
            pos: 'adverb',
            article: null,
            senses: [{ fa: 'به آن', hint: '' }],
            example: { de: 'Ich denke daran.', fa: 'به آن فکر می‌کنم.' },
          },
        },
        {
          dictionaryKey: 'Leer',
          status: 'approved',
          payload: { lemma: 'Leer', senses: [{ fa: ' ' }] },
        },
        {
          dictionaryKey: 'Entwurf',
          status: 'queued',
          payload: { lemma: 'Entwurf', senses: [{ fa: 'پیش‌نویس' }] },
        },
        {
          dictionaryKey: 'Wort1',
          status: 'approved',
          payload: JSON.parse(
            JSON.stringify({
              lemma: 'Wort1',
              article: 'das',
              pos: 'noun',
              freq: 5,
              ...JSON.parse(data('واژه 1')),
            }),
          ),
        },
      ],
    });
    expect(report).toMatchObject({
      ok: true,
      added: 1,
      changed: 1,
      deleted: 1,
      baseEntries: 52,
      entries: 52,
    });
    expect(report.skipped).toEqual([{ dictionaryKey: 'Leer', reason: 'no-meaning' }]);
    const haus = read(out, 'Haus')!;
    expect(haus.fa).toBe('خانه، منزل');
    // Fields the editor does not show survive the edit.
    expect(JSON.parse(haus.data)).toMatchObject({ ipa: 'haʊ̯s', audio: 'haus.ogg' });
    expect(JSON.parse(haus.data).examples).toEqual([
      { de: 'Das Haus ist groß.', fa: 'خانه بزرگ است.' },
    ]);
    expect(read(out, 'Katze')).toBeUndefined();
    expect(read(out, 'Entwurf')).toBeUndefined();
    const daran = read(out, 'daran')!;
    expect(daran.pos).toBe('adv');
    expect(JSON.parse(daran.data).examples).toHaveLength(1);
    // The live file is never modified.
    expect(read(base, 'Katze')).toBeDefined();
    const db = new DatabaseSync(out, { readOnly: true });
    expect(db.prepare('SELECT lemma FROM search WHERE fa MATCH ?').all('"منزل"')).toHaveLength(1);
    expect(db.prepare("SELECT value FROM meta WHERE key = 'sources'").get()).toEqual({
      value: 'Wiktionary; LearnBox editorial',
    });
    db.close();
  });

  it('fails the checks when a release would lose too much of the dictionary', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dict-build-'));
    const base = fixture(dir, 'dict-base.sqlite');
    const rows = Array.from({ length: 10 }, (_, i) => ({
      dictionaryKey: `Wort${i}`,
      status: 'deleted' as const,
      payload: {},
    }));
    const report = buildRelease({
      sqlite: DatabaseSync,
      basePath: base,
      outPath: join(dir, 'x.sqlite'),
      builtAt: 'x',
      rows,
    });
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.name === 'entries')?.ok).toBe(false);
  });

  it('rejects invalid articles, AI skips and renamed keys', () => {
    expect(
      releaseEntry(
        {
          dictionaryKey: 'X',
          status: 'approved',
          payload: { senses: [{ fa: 'a' }], article: 'den' },
        },
        undefined,
      ),
    ).toEqual({ reason: 'invalid-article' });
    expect(
      releaseEntry({ dictionaryKey: 'X', status: 'approved', payload: { skip: true } }, undefined),
    ).toEqual({ reason: 'ai-skip' });
    expect(
      releaseEntry(
        { dictionaryKey: ' X', status: 'approved', payload: { senses: [{ fa: 'a' }] } },
        undefined,
      ),
    ).toEqual({ reason: 'invalid-lemma' });
  });
});

describe('dictionary release publisher', () => {
  function setup() {
    const dir = mkdtempSync(join(tmpdir(), 'dict-pub-'));
    fixture(dir, 'dict-r4.sqlite');
    writeFileSync(
      join(dir, 'current.json'),
      JSON.stringify({
        file: 'dict-r4.sqlite',
        sha256: 'x',
        builtAt: 'a',
        at: '2026-11-04T00:00:00.000Z',
        entries: 52,
        added: 0,
        changed: 0,
        deleted: 0,
        actor: 'ops',
        kind: 'initial',
      }),
    );
    writeFileSync(
      join(dir, 'history.json'),
      JSON.stringify([JSON.parse(readFileSync(join(dir, 'current.json'), 'utf8'))]),
    );
    return { dir, publisher: new DictionaryReleasePublisher(dir, DatabaseSync) };
  }
  const edit = {
    dictionaryKey: 'Katze',
    status: 'approved' as const,
    payload: { lemma: 'Katze', article: 'die', senses: [{ fa: 'گربهٔ خانگی' }] },
  };

  it('publishes by swapping the pointer, then rolls back to the previous file', () => {
    const { dir, publisher } = setup();
    const published = publisher.publish([edit], 'actor', new Date('2026-11-05T10:00:00.123Z'));
    expect(published.status).toBe('published');
    const state = publisher.state();
    expect(state.current?.file).toBe('dict-20261105T100000Z.sqlite');
    expect(state.current).toMatchObject({
      changed: 1,
      kind: 'publish',
      at: '2026-11-05T10:00:00.123Z',
    });
    expect(read(join(dir, state.current!.file), 'Katze')?.fa).toBe('گربهٔ خانگی');
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp') || f.startsWith('.publish'))).toEqual(
      [],
    );

    const back = publisher.rollback('actor', new Date('2026-11-05T11:00:00.000Z'));
    expect(back).toMatchObject({
      status: 'rolled-back',
      record: { file: 'dict-r4.sqlite', kind: 'rollback' },
    });
    expect(publisher.state().current?.file).toBe('dict-r4.sqlite');
    expect(publisher.state().history).toHaveLength(3);
  });

  it('keeps the live release when checks fail and refuses a concurrent build', () => {
    const { dir, publisher } = setup();
    const rows = Array.from({ length: 10 }, (_, i) => ({
      dictionaryKey: `Wort${i}`,
      status: 'deleted' as const,
      payload: {},
    }));
    expect(publisher.publish(rows, 'actor', new Date()).status).toBe('failed');
    expect(publisher.state().current?.file).toBe('dict-r4.sqlite');
    expect(readdirSync(dir).filter((f) => f.endsWith('.sqlite'))).toEqual(['dict-r4.sqlite']);
    writeFileSync(join(dir, '.publish.lock'), JSON.stringify({ at: Date.now() }));
    expect(publisher.publish([edit], 'actor', new Date())).toEqual({ status: 'busy' });
    expect(publisher.rollback('actor', new Date())).toEqual({ status: 'busy' });
  });

  it('is unconfigured without a live pointer and has nothing to roll back to at first', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dict-pub-'));
    const publisher = new DictionaryReleasePublisher(dir, DatabaseSync);
    expect(publisher.publish([edit], 'actor', new Date())).toEqual({ status: 'unconfigured' });
    expect(setup().publisher.rollback('a', new Date())).toEqual({ status: 'none' });
  });
});
