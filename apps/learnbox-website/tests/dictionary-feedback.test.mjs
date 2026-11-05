import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const { parseFeedback, recordFeedback, allow } = await import('../src/dictionary/feedback.ts');
const exists = (l) => l === 'Haus';

test('accepts only word-like misses and reports on real words', () => {
  assert.deepEqual(parseFeedback({ type: 'miss', q: '  Schmetterling ' }, exists), {
    type: 'miss',
    q: 'Schmetterling',
  });
  assert.deepEqual(parseFeedback({ type: 'miss', q: 'می‌خواهم' }, exists), {
    type: 'miss',
    q: 'می‌خواهم',
  });
  for (const q of ['a', 'http://x.y', 'abc123', 'x'.repeat(60), '<b>hi</b>', 42])
    assert.equal(parseFeedback({ type: 'miss', q }, exists), null, String(q));
  assert.deepEqual(
    parseFeedback(
      { type: 'report', lemma: 'Haus', kind: 'meaning', note: ' a\u0000b\n c ' },
      exists,
    ),
    {
      type: 'report',
      lemma: 'Haus',
      kind: 'meaning',
      note: 'a b c',
    },
  );
  assert.equal(parseFeedback({ type: 'report', lemma: 'Nope', kind: 'meaning' }, exists), null);
  assert.equal(parseFeedback({ type: 'report', lemma: 'Haus', kind: 'spam' }, exists), null);
  assert.equal(
    parseFeedback({ type: 'report', lemma: 'Haus', kind: 'other', note: 'x'.repeat(900) }, exists)
      .note.length,
    500,
  );
});

test('appends one JSON line per item, with no visitor data', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dict-fb-'));
  assert.equal(recordFeedback({ type: 'miss', q: 'Haus' }), false);
  process.env.LEARNBOX_DICTIONARY_FEEDBACK_DIR = dir;
  recordFeedback({ type: 'miss', q: 'Schmetterling' }, new Date('2026-11-05T00:00:00Z'));
  recordFeedback(
    { type: 'report', lemma: 'Haus', kind: 'example', note: '' },
    new Date('2026-11-05T00:00:01Z'),
  );
  const lines = readFileSync(join(dir, 'feedback.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  assert.deepEqual(lines, [
    { type: 'miss', q: 'Schmetterling', at: '2026-11-05T00:00:00.000Z' },
    { type: 'report', lemma: 'Haus', kind: 'example', note: '', at: '2026-11-05T00:00:01.000Z' },
  ]);
});

test('rate limit resets after the window', () => {
  assert.equal(allow('k', 0, 2, 100), true);
  assert.equal(allow('k', 1, 2, 100), true);
  assert.equal(allow('k', 2, 2, 100), false);
  assert.equal(allow('k', 200, 2, 100), true);
});
