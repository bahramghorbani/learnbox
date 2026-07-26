import { describe, expect, it } from 'vitest';
import { validateWordCard, type WordCardDraft } from '../src/index.js';

const validCard: WordCardDraft = {
  id: 'synthetic-haus-001',
  version: 1,
  status: 'in_review',
  lemma: 'Haus',
  article: 'das',
  partOfSpeech: 'noun',
  cefr: 'A1',
  persianMeanings: ['خانه'],
  examples: [{ german: 'Das Haus ist groß.', persian: 'خانه بزرگ است.' }],
  media: [
    {
      assetId: 'synthetic-image-001',
      version: 1,
      kind: 'image',
      url: 'https://media.example.test/haus.webp',
      qualityStatus: 'approved',
    },
  ],
  source: { provider: 'editorial', reference: 'synthetic fixture' },
};

describe('validateWordCard', () => {
  it('accepts a review-ready synthetic card', () => {
    expect(validateWordCard(validCard)).toEqual([]);
  });

  it('rejects a published AI suggestion and unapproved media', () => {
    const issues = validateWordCard({
      ...validCard,
      status: 'published',
      source: { provider: 'ai_suggestion' },
      media: [{ ...validCard.media[0], qualityStatus: 'pending' }],
    });
    expect(issues.map((issue) => issue.field)).toEqual(['media.qualityStatus', 'source']);
  });

  it('rejects missing meaning and invalid media addresses', () => {
    const issues = validateWordCard({
      ...validCard,
      persianMeanings: [],
      media: [{ ...validCard.media[0], url: 'http://insecure.example.test/haus.webp' }],
    });
    expect(issues.map((issue) => issue.field)).toEqual(['persianMeanings', 'media']);
  });
});
