import assert from 'node:assert/strict';
import { test } from 'node:test';
import { wordPhrase } from './avalai-audio-phrase.mjs';

// Issue #59 acceptance contract: word audio must be produced and reviewed as
// the exact displayed German lexical phrase, including its article where
// displayed (for example `das Haus`).

test('nouns include the displayed German article', () => {
  assert.equal(wordPhrase({ lemma: 'Haus', article: 'das' }), 'das Haus');
  assert.equal(wordPhrase({ lemma: 'Tisch', article: 'der' }), 'der Tisch');
  assert.equal(wordPhrase({ lemma: 'Tür', article: 'die' }), 'die Tür');
  assert.equal(wordPhrase({ lemma: 'Apfel', article: 'der' }), 'der Apfel');
});

test('non-nouns keep the bare lemma or expression', () => {
  assert.equal(wordPhrase({ lemma: 'lernen' }), 'lernen');
  assert.equal(wordPhrase({ lemma: 'glücklich', article: '' }), 'glücklich');
  assert.equal(wordPhrase({ lemma: 'Guten Tag' }), 'Guten Tag');
  assert.equal(wordPhrase({ lemma: 'danke', article: undefined }), 'danke');
});

test('matches what the bundled Start cards display in the UI', () => {
  // The three bundled cards show `das Haus`, `der Tisch`, `die Tür`.
  assert.equal(wordPhrase({ lemma: 'Haus', article: 'das' }), 'das Haus');
  assert.equal(wordPhrase({ lemma: 'Tisch', article: 'der' }), 'der Tisch');
  assert.equal(wordPhrase({ lemma: 'Tür', article: 'die' }), 'die Tür');
});
