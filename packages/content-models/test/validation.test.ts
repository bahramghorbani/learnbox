import { describe, expect, it } from 'vitest';
import {
  evaluateAiSuggestion,
  transitionContentReview,
  validateVocabularyMediaQa,
  validateLearningVocabularyItem,
  validateWordCard,
  type LearningVocabularyItem,
  type WordCardDraft,
} from '../src/index.js';

const validCard: WordCardDraft = {
  id: 'synthetic-haus-001',
  version: 1,
  status: 'needs_review',
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

const validVocabularyItem: LearningVocabularyItem = {
  ...validCard,
  normalizedLemma: 'haus',
  simpleGermanDefinition: 'Ein Gebäude, in dem Menschen wohnen.',
  essentialInflection: 'die Häuser',
  pronunciation: { ipa: 'haʊs', locale: 'de-DE' },
  grammarNote: 'Neutrum; Plural mit Umlaut.',
  topicTags: ['household'],
  difficulty: 1,
  visualConcept: 'A clear house with a small Bobo at the door.',
  imagePrompt: 'Soft 3D house, object dominant, no text.',
  provenance: { sourceType: 'editorial', sourceReference: 'synthetic fixture' },
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

  it('routes AI suggestions through validation and human review', () => {
    const decision = evaluateAiSuggestion(
      { ...validCard, status: 'ai_generated', source: { provider: 'ai_suggestion' } },
      0.92,
    );

    expect(decision).toMatchObject({
      nextStatus: 'auto_validated',
      issues: [],
      requiresHumanReview: true,
    });
  });

  it('escalates low-confidence or invalid AI suggestions without publishing them', () => {
    const decision = evaluateAiSuggestion(
      {
        ...validCard,
        status: 'ai_generated',
        source: { provider: 'ai_suggestion' },
        persianMeanings: [],
      },
      0.4,
    );

    expect(decision.nextStatus).toBe('needs_review');
    expect(decision.issues.map((issue) => issue.field)).toContain('persianMeanings');
    expect(decision.requiresHumanReview).toBe(true);
  });

  it('keeps review approval separate from publication', () => {
    expect(transitionContentReview('auto_validated', 'approve')).toEqual({
      nextStatus: 'approved',
      action: 'approve',
      requiresPublisher: true,
    });
    expect(() => transitionContentReview('published', 'approve')).toThrow(
      'Only review-queue content can receive a review decision.',
    );
  });

  it('records a rejected editorial outcome without publishing', () => {
    expect(transitionContentReview('needs_review', 'reject')).toEqual({
      nextStatus: 'rejected',
      action: 'reject',
      requiresPublisher: false,
    });
  });

  it('returns a card for revision without publishing it', () => {
    expect(transitionContentReview('auto_validated', 'return_for_revision')).toEqual({
      nextStatus: 'needs_review',
      action: 'return_for_revision',
      requiresPublisher: false,
    });
  });

  it('refuses a review decision on a card that left the review queue', () => {
    for (const status of ['approved', 'rejected', 'published', 'queued'] as const) {
      expect(() => transitionContentReview(status, 'approve')).toThrow(
        'Only review-queue content can receive a review decision.',
      );
    }
  });

  it('validates the complete reusable vocabulary-item contract', () => {
    expect(validateLearningVocabularyItem(validVocabularyItem)).toEqual([]);
    expect(
      validateLearningVocabularyItem({
        ...validVocabularyItem,
        topicTags: [],
        imagePrompt: '',
      }).map((issue) => issue.field),
    ).toEqual(['topicTags', 'visual']);
  });

  it('requires approved semantic, Bobo and audio QA for released vocabulary media', () => {
    const invalidQa = {
      visual: {
        semanticRole: 'concrete_noun' as const,
        boboRole: 'primary' as const,
        boboCanonicalVersion: '1.0.0' as const,
        semanticAccurate: true,
        primaryConceptClear: true,
        mobileReadable: true,
        hasGeneratedText: false,
        hasWatermark: false,
        hasUnnecessaryClutter: false,
      },
      audio: {
        wordAudioVerified: true,
        sentenceAudioVerified: false,
        noTruncationOrDistortion: true,
      },
    };
    expect(validateVocabularyMediaQa(invalidQa).map((issue) => issue.field)).toEqual([
      'mediaQa.visual.bobo',
      'mediaQa.audio',
    ]);
    expect(
      validateLearningVocabularyItem({ ...validVocabularyItem, status: 'published' }).map(
        (issue) => issue.field,
      ),
    ).toContain('mediaQa');
  });

  it('rejects a visual that is not semantically accurate or readable', () => {
    expect(
      validateVocabularyMediaQa({
        visual: {
          semanticRole: 'concrete_noun',
          boboRole: 'absent',
          boboCanonicalVersion: '1.0.0',
          semanticAccurate: false,
          primaryConceptClear: false,
          mobileReadable: false,
          hasGeneratedText: false,
          hasWatermark: false,
          hasUnnecessaryClutter: false,
        },
        audio: {
          wordAudioVerified: true,
          sentenceAudioVerified: true,
          noTruncationOrDistortion: true,
        },
      }).map((issue) => issue.field),
    ).toEqual(['mediaQa.visual']);
  });

  it('rejects a visual that embeds generated text, watermark or clutter', () => {
    expect(
      validateVocabularyMediaQa({
        visual: {
          semanticRole: 'concrete_noun',
          boboRole: 'absent',
          boboCanonicalVersion: '1.0.0',
          semanticAccurate: true,
          primaryConceptClear: true,
          mobileReadable: true,
          hasGeneratedText: true,
          hasWatermark: true,
          hasUnnecessaryClutter: true,
        },
        audio: {
          wordAudioVerified: true,
          sentenceAudioVerified: true,
          noTruncationOrDistortion: true,
        },
      }).map((issue) => issue.field),
    ).toEqual(['mediaQa.visual']);
  });

  it('rejects non-canonical Bobo or Bobo primary on nouns and places', () => {
    const nonCanonical = validateVocabularyMediaQa({
      visual: {
        semanticRole: 'action_or_emotion',
        boboRole: 'primary',
        boboCanonicalVersion: '0.9.0',
        semanticAccurate: true,
        primaryConceptClear: true,
        mobileReadable: true,
        hasGeneratedText: false,
        hasWatermark: false,
        hasUnnecessaryClutter: false,
      },
      audio: {
        wordAudioVerified: true,
        sentenceAudioVerified: true,
        noTruncationOrDistortion: true,
      },
    });
    expect(nonCanonical.map((issue) => issue.field)).toEqual(['mediaQa.visual.bobo']);

    // Bobo primary on a concrete noun is invalid even at the canonical version.
    const nounPrimary = validateVocabularyMediaQa({
      visual: {
        semanticRole: 'concrete_noun',
        boboRole: 'primary',
        boboCanonicalVersion: '1.0.0',
        semanticAccurate: true,
        primaryConceptClear: true,
        mobileReadable: true,
        hasGeneratedText: false,
        hasWatermark: false,
        hasUnnecessaryClutter: false,
      },
      audio: {
        wordAudioVerified: true,
        sentenceAudioVerified: true,
        noTruncationOrDistortion: true,
      },
    });
    expect(nounPrimary.map((issue) => issue.field)).toEqual(['mediaQa.visual.bobo']);
  });

  it('rejects truncated or unverified audio', () => {
    expect(
      validateVocabularyMediaQa({
        visual: {
          semanticRole: 'concrete_noun',
          boboRole: 'absent',
          boboCanonicalVersion: '1.0.0',
          semanticAccurate: true,
          primaryConceptClear: true,
          mobileReadable: true,
          hasGeneratedText: false,
          hasWatermark: false,
          hasUnnecessaryClutter: false,
        },
        audio: {
          wordAudioVerified: false,
          sentenceAudioVerified: true,
          noTruncationOrDistortion: false,
        },
      }).map((issue) => issue.field),
    ).toEqual(['mediaQa.audio']);
  });
});
