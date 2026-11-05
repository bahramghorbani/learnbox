// The landing follows the release Admin publishes: current.json in LEARNBOX_DICTIONARY_DIR names
// the live file, and a publish or rollback reaches the site without a restart.
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { mock, test } from 'node:test';

function release(dir, name, fa) {
  const db = new DatabaseSync(join(dir, name));
  db.exec(`
    CREATE TABLE entry (lemma TEXT PRIMARY KEY, article TEXT, pos TEXT, fa TEXT NOT NULL, freq INTEGER NOT NULL, data TEXT NOT NULL) WITHOUT ROWID;
    CREATE TABLE form (form TEXT NOT NULL, lemma TEXT NOT NULL, PRIMARY KEY (form, lemma)) WITHOUT ROWID;
  `);
  db.prepare('INSERT INTO entry VALUES (?, ?, ?, ?, ?, ?)').run(
    'Haus',
    'das',
    'noun',
    fa,
    5,
    JSON.stringify({ senses: [{ fa, hint: '' }], examples: [] }),
  );
  db.close();
}

test('serves the release current.json points at and follows a new publish', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dict-dir-'));
  release(dir, 'dict-a.sqlite', 'خانه');
  release(dir, 'dict-b.sqlite', 'منزل');
  const point = (file) => writeFileSync(join(dir, 'current.json'), JSON.stringify({ file }));
  point('dict-a.sqlite');
  process.env.LEARNBOX_DICTIONARY_ENABLED = 'true';
  process.env.LEARNBOX_DICTIONARY_DIR = dir;
  delete process.env.LEARNBOX_DICTIONARY_FILE;
  mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  try {
    const store = await import('../src/dictionary/store.ts');
    assert.equal(store.dictionaryEnabled(), true);
    assert.equal(store.getEntry('Haus').fa, 'خانه');

    point('dict-b.sqlite');
    // Re-checked at most every 10 seconds, so a burst of requests does not re-read the pointer.
    assert.equal(store.getEntry('Haus').fa, 'خانه');
    mock.timers.tick(11_000);
    assert.equal(store.getEntry('Haus').fa, 'منزل');

    // A pointer that is not a plain release name, or names a missing file, is ignored.
    point('../dict-a.sqlite');
    mock.timers.tick(11_000);
    assert.equal(store.getEntry('Haus').fa, 'منزل');
    assert.equal(store.dictionaryEnabled(), false);
    point('dict-a.sqlite');
    mock.timers.tick(11_000);
    assert.equal(store.getEntry('Haus').fa, 'خانه');
  } finally {
    mock.timers.reset();
  }
});
