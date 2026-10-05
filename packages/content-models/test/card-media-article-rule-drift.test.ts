import { describe, expect, it } from 'vitest';

// The legacy operator-script copy of the article rule. It is plain ESM and is imported by
// `pnpm verify:issue59-audio-gate`, which runs inside the CI quality gate before any workspace
// package is built — so those scripts cannot depend on this package's build output.
import { wordPhrase } from '../../../scripts/avalai-audio-phrase.mjs';
import { buildSpokenWordTarget } from '../src/card-media-generation.js';

/**
 * Drift guard for the canonical word-audio article rule.
 *
 * `buildSpokenWordTarget` in this package is the authority for the product runtime. The operator
 * scripts keep an independent copy only because of the build-order constraint above. This test
 * pins the two together: if either definition changes, this fails rather than letting the Admin
 * and the batch tooling disagree about what a learner hears.
 */
describe('article rule has exactly one behaviour across layers', () => {
  const cases = [
    { article: 'der', lemma: 'Tisch' },
    { article: 'die', lemma: 'Lampe' },
    { article: 'das', lemma: 'Buch' },
    { article: 'das', lemma: 'Haus' },
    { lemma: 'gehen' },
    { lemma: 'kalt' },
    { lemma: 'Guten Tag' },
    { article: '', lemma: 'schnell' },
  ];

  it.each(cases)('agrees for %j', (card) => {
    expect(wordPhrase(card)).toBe(buildSpokenWordTarget(card));
  });

  it('agrees that nouns keep their article and other words do not gain one', () => {
    expect(wordPhrase({ article: 'der', lemma: 'Tisch' })).toBe('der Tisch');
    expect(buildSpokenWordTarget({ article: 'der', lemma: 'Tisch' })).toBe('der Tisch');
    expect(wordPhrase({ lemma: 'gehen' })).toBe('gehen');
    expect(buildSpokenWordTarget({ lemma: 'gehen' })).toBe('gehen');
  });
});
