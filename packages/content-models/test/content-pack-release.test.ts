import { describe, expect, it } from 'vitest';

import {
  evaluateContentPackReleaseReadiness,
  type ContentPackManifest,
  type LearningVocabularyItem,
} from '../src/index.js';

const manifest: ContentPackManifest = {
  id: 'release-fixture',
  version: 1,
  tierId: 'learnbox_start',
  displayName: 'Release fixture',
  locale: 'de-DE',
  targetCefr: 'A1',
  targetItemCount: 1,
  releaseStatus: 'staging',
};

const readyItem: LearningVocabularyItem = {
  id: 'release-fixture-001',
  version: 1,
  status: 'approved',
  lemma: 'Haus',
  normalizedLemma: 'haus',
  article: 'das',
  partOfSpeech: 'noun',
  cefr: 'A1',
  persianMeanings: ['خانه'],
  examples: [{ german: 'Das Haus ist groß.', persian: 'خانه بزرگ است.' }],
  media: [
    {
      assetId: 'release-image-001',
      version: 1,
      kind: 'image',
      url: 'https://media.example.test/haus.webp',
      qualityStatus: 'approved',
    },
    {
      assetId: 'release-word-audio-001',
      version: 1,
      kind: 'word_audio',
      url: 'https://media.example.test/haus-word.mp3',
      qualityStatus: 'approved',
    },
    {
      assetId: 'release-sentence-audio-001',
      version: 1,
      kind: 'sentence_audio',
      url: 'https://media.example.test/haus-sentence.mp3',
      qualityStatus: 'approved',
    },
  ],
  source: { provider: 'editorial', reference: 'release fixture' },
  simpleGermanDefinition: 'Ein Gebäude, in dem Menschen wohnen.',
  grammarNote: 'Neutrum; Plural mit Umlaut.',
  topicTags: ['household'],
  difficulty: 1,
  visualConcept: 'A clear house.',
  imagePrompt: 'A clear house, no text.',
  provenance: { sourceType: 'editorial', sourceReference: 'release fixture' },
  mediaQa: {
    visual: {
      semanticRole: 'concrete_noun',
      boboRole: 'absent',
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
  },
};

describe('content pack release readiness', () => {
  it('allows only a publisher to release a fully staged and reviewed pack', () => {
    expect(evaluateContentPackReleaseReadiness(manifest, [readyItem], 'content_publisher')).toEqual(
      {
        canRelease: true,
        blockers: [],
      },
    );
  });

  it('keeps reviewer approval separate from the publisher release action', () => {
    const readiness = evaluateContentPackReleaseReadiness(
      manifest,
      [readyItem],
      'content_reviewer',
    );
    expect(readiness.canRelease).toBe(false);
    expect(readiness.blockers).toContain('فقط ناشر محتوا می‌تواند انتشار بسته را درخواست کند.');
  });

  it('blocks incomplete media and an undersized draft pack', () => {
    const readiness = evaluateContentPackReleaseReadiness(
      { ...manifest, releaseStatus: 'draft', targetItemCount: 2 },
      [
        {
          ...readyItem,
          status: 'needs_review',
          media: [{ ...readyItem.media[0], qualityStatus: 'pending' }],
        },
      ],
      'content_publisher',
    );
    expect(readiness.canRelease).toBe(false);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        'بسته باید پیش از انتشار در وضعیت آماده‌سازی باشد.',
        'تعداد آیتم‌های بسته با نسخهٔ مورد انتظار هم‌خوان نیست.',
        'کارت release-fixture-001 هنوز تأیید سردبیری نشده است.',
      ]),
    );
  });

  it('allows a super admin to release as well', () => {
    expect(evaluateContentPackReleaseReadiness(manifest, [readyItem], 'super_admin')).toEqual({
      canRelease: true,
      blockers: [],
    });
  });

  it('blocks a pack whose item is not fully reviewed even when approved', () => {
    const readiness = evaluateContentPackReleaseReadiness(
      manifest,
      [{ ...readyItem, status: 'returned' }],
      'content_publisher',
    );
    expect(readiness.canRelease).toBe(false);
    expect(readiness.blockers).toContain('کارت release-fixture-001 هنوز تأیید سردبیری نشده است.');
  });

  it('blocks an approved item that still fails the publication gates', () => {
    // An approved card whose translated meaning is missing fails the publish validation.
    const readiness = evaluateContentPackReleaseReadiness(
      manifest,
      [{ ...readyItem, persianMeanings: [] }],
      'content_publisher',
    );
    expect(readiness.canRelease).toBe(false);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        'کارت release-fixture-001 هنوز همهٔ دروازه‌های انتشار را رد نکرده است.',
      ]),
    );
  });

  it('accumulates every blocker across all items', () => {
    const readiness = evaluateContentPackReleaseReadiness(
      { ...manifest, releaseStatus: 'draft', targetItemCount: 2 },
      [{ ...readyItem, status: 'needs_review' }],
      'content_reviewer',
    );
    expect(readiness.canRelease).toBe(false);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        'فقط ناشر محتوا می‌تواند انتشار بسته را درخواست کند.',
        'بسته باید پیش از انتشار در وضعیت آماده‌سازی باشد.',
        'تعداد آیتم‌های بسته با نسخهٔ مورد انتظار هم‌خوان نیست.',
        'کارت release-fixture-001 هنوز تأیید سردبیری نشده است.',
      ]),
    );
  });
});
