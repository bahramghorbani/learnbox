import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

test('finds headwords the source stores fully or partly decomposed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dict-nfc-'));
  const db = new DatabaseSync(join(dir, 'dict-a.sqlite'));
  db.exec(`CREATE TABLE entry (lemma TEXT PRIMARY KEY, article TEXT, pos TEXT, fa TEXT NOT NULL, freq INTEGER NOT NULL, data TEXT NOT NULL) WITHOUT ROWID;
    CREATE TABLE form (form TEXT NOT NULL, lemma TEXT NOT NULL, PRIMARY KEY (form, lemma)) WITHOUT ROWID;`);
  const mixed = 'Milit\u00e4rattache\u0301'; // composed ä, decomposed é
  for (const l of ['Identita\u0308t', mixed, 'Haus'])
    db.prepare('INSERT INTO entry VALUES (?, null, null, ?, 1, ?)').run(l, 'x', '{}');
  db.close();
  writeFileSync(join(dir, 'current.json'), JSON.stringify({ file: 'dict-a.sqlite' }));
  process.env.LEARNBOX_DICTIONARY_ENABLED = 'true';
  process.env.LEARNBOX_DICTIONARY_DIR = dir;
  const { storedSpelling } = await import('../src/dictionary/store.ts');
  const { wordHref } = await import('../src/dictionary/href.ts');
  assert.equal(storedSpelling('Identität'), 'Identita\u0308t');
  assert.equal(storedSpelling('Militärattaché'), mixed);
  assert.equal(storedSpelling('Haus'), null);
  assert.equal(wordHref(mixed), '/dictionary/Milit%C3%A4rattach%C3%A9');
});
