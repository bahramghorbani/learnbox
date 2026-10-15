import { describe, expect, it } from 'vitest';

import {
  buildCardImagePrompt,
  buildSpokenSentenceTarget,
  buildSpokenWordTarget,
  deriveCardImageSubject,
  isGermanArticle,
  normalizeGermanArticle,
  resolveEffectiveGermanVoice,
  resolveGermanVoiceRole,
  validateGermanArticleVoices,
  type GermanVoiceMapping,
} from '../src/card-media-generation.js';

/**
 * These tests protect two permanent LearnBox product rules at the application level.
 *
 * They deliberately assert on the spoken target LearnBox constructs — not on prompt text and not
 * on provider behaviour — so a future TTS/model/provider change cannot quietly drop the canonical
 * article from learner pronunciation or disturb the deterministic voice mapping.
 */

describe('canonical word-audio article rule', () => {
  it('speaks the canonical article together with the noun', () => {
    expect(buildSpokenWordTarget({ article: 'der', lemma: 'Tisch' })).toBe('der Tisch');
    expect(buildSpokenWordTarget({ article: 'die', lemma: 'Lampe' })).toBe('die Lampe');
    expect(buildSpokenWordTarget({ article: 'das', lemma: 'Buch' })).toBe('das Buch');
  });

  it('never reduces a noun with an article to the bare lemma', () => {
    for (const [article, lemma] of [
      ['der', 'Tisch'],
      ['die', 'Lampe'],
      ['das', 'Buch'],
    ] as const) {
      const spoken = buildSpokenWordTarget({ article, lemma });
      expect(spoken).not.toBe(lemma);
      expect(spoken.startsWith(`${article} `)).toBe(true);
      expect(spoken).toContain(lemma);
    }
  });

  it('does not invent an article for vocabulary that has none', () => {
    // Verbs, adjectives, adverbs and phrases must be spoken as the canonical German term.
    expect(buildSpokenWordTarget({ lemma: 'gehen' })).toBe('gehen');
    expect(buildSpokenWordTarget({ article: null, lemma: 'kalt' })).toBe('kalt');
    expect(buildSpokenWordTarget({ article: '', lemma: 'Guten Tag' })).toBe('Guten Tag');
    expect(buildSpokenWordTarget({ article: '   ', lemma: 'schnell' })).toBe('schnell');
    for (const spoken of ['gehen', 'kalt', 'Guten Tag', 'schnell']) {
      expect(/^(der|die|das)\s/i.test(spoken)).toBe(false);
    }
  });

  it('normalizes article casing and surrounding whitespace', () => {
    expect(buildSpokenWordTarget({ article: 'DER', lemma: 'Tisch' })).toBe('der Tisch');
    expect(buildSpokenWordTarget({ article: ' Die ', lemma: 'Lampe' })).toBe('die Lampe');
  });

  it('treats a non-canonical article value as no article instead of speaking it', () => {
    // Malformed data must never put a non-word into learner audio.
    expect(buildSpokenWordTarget({ article: 'el', lemma: 'Tisch' })).toBe('Tisch');
    expect(buildSpokenWordTarget({ article: 'the', lemma: 'Tisch' })).toBe('Tisch');
  });

  it('does not duplicate an article already present on the lemma', () => {
    expect(buildSpokenWordTarget({ article: 'das', lemma: 'das Haus' })).toBe('das Haus');
  });

  it('refuses to build a target without a canonical lemma', () => {
    expect(() => buildSpokenWordTarget({ lemma: '  ' })).toThrow();
  });
});

describe('canonical sentence-audio target', () => {
  it('speaks the complete canonical German sentence unchanged', () => {
    const sentence = 'Der Tisch ist aus Holz und steht in der Küche.';
    expect(buildSpokenSentenceTarget(sentence)).toBe(sentence);
  });

  it('refuses an empty sentence rather than generating silence', () => {
    expect(() => buildSpokenSentenceTarget('')).toThrow();
    expect(() => buildSpokenSentenceTarget(null)).toThrow();
  });
});

describe('canonical article to voice mapping', () => {
  const mapping: GermanVoiceMapping = {
    der: 'german-male',
    die: 'german-female',
    das: 'german-younger',
    default: 'german-default',
  };
  const withoutYounger: GermanVoiceMapping = { ...mapping, das: undefined };

  it('requires three pairwise-distinct article voices', () => {
    expect(validateGermanArticleVoices(mapping)).toBeUndefined();
    expect(validateGermanArticleVoices(withoutYounger)).toBe('das_voice_unconfigured');
    expect(validateGermanArticleVoices({ ...mapping, das: mapping.die })).toBe(
      'das_voice_unconfigured',
    );
    expect(validateGermanArticleVoices({ ...mapping, die: mapping.der })).toBe(
      'article_voices_not_distinct',
    );
  });

  it('derives the role from canonical card data only', () => {
    expect(resolveGermanVoiceRole({ article: 'der', lemma: 'Tisch' })).toBe('der_masculine');
    expect(resolveGermanVoiceRole({ article: 'die', lemma: 'Lampe' })).toBe('die_feminine');
    expect(resolveGermanVoiceRole({ article: 'das', lemma: 'Buch' })).toBe('das_neuter');
    expect(resolveGermanVoiceRole({ lemma: 'gehen' })).toBe('default_no_article');
  });

  it('maps der to the configured German male voice', () => {
    expect(resolveEffectiveGermanVoice({ article: 'der', lemma: 'Tisch' }, mapping)).toEqual({
      role: 'der_masculine',
      voice: 'german-male',
      usesDieFallbackForDas: false,
    });
  });

  it('maps die to the configured German female voice', () => {
    expect(resolveEffectiveGermanVoice({ article: 'die', lemma: 'Lampe' }, mapping)).toEqual({
      role: 'die_feminine',
      voice: 'german-female',
      usesDieFallbackForDas: false,
    });
  });

  it('maps das to the configured younger German voice when one is available', () => {
    expect(resolveEffectiveGermanVoice({ article: 'das', lemma: 'Buch' }, mapping)).toEqual({
      role: 'das_neuter',
      voice: 'german-younger',
      usesDieFallbackForDas: false,
    });
  });

  it('refuses DAS fallback when no distinct younger voice is configured', () => {
    expect(() =>
      resolveEffectiveGermanVoice({ article: 'das', lemma: 'Buch' }, withoutYounger),
    ).toThrow('A distinct DAS voice is required.');
  });

  it('refuses DAS when it equals the DIE voice', () => {
    expect(() =>
      resolveEffectiveGermanVoice(
        { article: 'das', lemma: 'Buch' },
        { ...mapping, das: mapping.die },
      ),
    ).toThrow('A distinct DAS voice is required.');
  });

  it('maps no-article vocabulary to the configured default German voice', () => {
    expect(resolveEffectiveGermanVoice({ lemma: 'gehen' }, mapping)).toEqual({
      role: 'default_no_article',
      voice: 'german-default',
      usesDieFallbackForDas: false,
    });
  });

  it('is deterministic for the same card and mapping', () => {
    const card = { article: 'das', lemma: 'Buch' };
    const runs = Array.from({ length: 5 }, () =>
      JSON.stringify(resolveEffectiveGermanVoice(card, mapping)),
    );
    expect(new Set(runs).size).toBe(1);
  });

  it('keeps word and sentence audio on one effective voice identity per card', () => {
    const card = { article: 'der', lemma: 'Tisch' };
    expect(resolveEffectiveGermanVoice(card, mapping)).toEqual(
      resolveEffectiveGermanVoice(card, mapping),
    );
  });
});

describe('canonical article helpers', () => {
  it('recognizes only canonical German articles', () => {
    expect(isGermanArticle('der')).toBe(true);
    expect(isGermanArticle('DIE')).toBe(true);
    expect(isGermanArticle('das')).toBe(true);
    for (const value of ['el', 'the', '', '   ', null, undefined, 7]) {
      expect(isGermanArticle(value)).toBe(false);
    }
  });

  it('normalizes to the canonical lowercase article', () => {
    expect(normalizeGermanArticle(' Der ')).toBe('der');
    expect(normalizeGermanArticle('nope')).toBeUndefined();
  });
});

describe('canonical image prompt composition', () => {
  const standard = {
    version: 'v2',
    model: 'flux.2-pro',
    style: 'CANONICAL_LEARNBOX_STYLE no text, no logos.',
  };

  it('composes the card subject with the canonical LearnBox style', () => {
    const prompt = buildCardImagePrompt(
      {
        lemma: 'Tisch',
        article: 'der',
        brief: 'One simple wooden dining table, large and centered.',
      },
      standard,
    );
    expect(prompt).toContain('One simple wooden dining table, large and centered.');
    expect(prompt).toContain(standard.style);
    expect(prompt).toContain('Iranian learners');
    expect(prompt).toMatch(/no text, letters, numbers.*brand logos.*watermarks/i);
  });

  it('prefers a curated brief, then a curated visual concept', () => {
    expect(deriveCardImageSubject({ lemma: 'Tisch', brief: 'B', visualConcept: 'V' })).toBe('B');
    expect(deriveCardImageSubject({ lemma: 'Tisch', visualConcept: 'V' })).toBe('V');
  });

  it('derives a conservative single-subject brief when nothing is curated', () => {
    const subject = deriveCardImageSubject({ lemma: 'Tisch', article: 'der' });
    expect(subject).toContain('der Tisch');
    expect(subject).toContain('dominant teaching concept');
  });

  it('refuses to build a prompt when the canonical style is missing', () => {
    expect(() => buildCardImagePrompt({ lemma: 'Tisch' }, { ...standard, style: '' })).toThrow();
  });
});
