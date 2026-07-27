import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  findDuplicateContentIds,
  normalizeGermanLemma,
  prepareContentBatchForReview,
  validateContentBatch,
  validateStartSliceCandidates,
} from '../src/index.js';
import type { ContentPackManifest, LearningVocabularyItem } from '@learnbox/content-models';

const item = (id: string, lemma: string) => ({
  id,
  version: 1,
  status: 'needs_review' as const,
  lemma,
  normalizedLemma: lemma.toLowerCase(),
  article: 'das' as const,
  partOfSpeech: 'noun' as const,
  cefr: 'A1' as const,
  persianMeanings: ['خانه'],
  simpleGermanDefinition: 'Ein Gebäude, in dem Menschen wohnen.',
  essentialInflection: 'die Häuser',
  pronunciation: { ipa: 'haʊs', locale: 'de-DE' as const },
  examples: [{ german: 'Das Haus ist groß.', persian: 'خانه بزرگ است.' }],
  grammarNote: 'Neutrum; Plural mit Umlaut.',
  topicTags: ['household'],
  difficulty: 1 as const,
  visualConcept: 'A house is the primary object.',
  imagePrompt: 'Soft 3D house, no text.',
  media: [],
  source: { provider: 'editorial' as const, reference: 'synthetic test fixture' },
  provenance: { sourceType: 'editorial' as const, sourceReference: 'synthetic test fixture' },
});

const manifest = {
  id: 'learnbox_start_a1_essentials',
  version: 1,
  tierId: 'learnbox_start' as const,
  displayName: 'Synthetic test pack',
  locale: 'de-DE' as const,
  targetCefr: 'A1' as const,
  targetItemCount: 350,
  releaseStatus: 'draft' as const,
};

describe('content factory batch validation', () => {
  it('normalizes German lemmas before duplicate checks', () => {
    expect(normalizeGermanLemma('  DAS   HAUS ')).toBe('das haus');
    expect(findDuplicateContentIds([item('one', 'Haus'), item('two', ' haus ')])).toEqual([
      'one',
      'two',
    ]);
  });

  it('prepares a complete controlled batch only for human review', () => {
    const result = validateContentBatch({
      batchId: 'start-a1-slice-v1',
      manifest,
      expectedItemCount: 1,
      items: [item('start-haus-001', 'Haus')],
    });
    expect(result).toEqual({ batchId: 'start-a1-slice-v1', readyForHumanReview: true, issues: [] });
  });

  it('rejects incomplete and duplicate batch proposals before review', () => {
    const result = validateContentBatch({
      batchId: 'start-a1-slice-v1',
      manifest,
      expectedItemCount: 3,
      items: [item('one', 'Haus'), item('two', 'Haus')],
    });
    expect(result.readyForHumanReview).toBe(false);
    expect(result.issues.map((issue) => issue.field)).toEqual(['items', 'items.normalizedLemma']);
  });

  it('requires every Start slice candidate category before linguistic review', () => {
    const candidates = [
      {
        candidateId: 'candidate-1',
        lemmaHint: 'Haus',
        category: 'household_noun' as const,
        selectionRationale: 'home',
        sourceUrl: 'https://example.test/a1',
        sourceEntryVerification: 'pending_linguistic_review' as const,
      },
    ];
    const result = validateStartSliceCandidates(candidates, 1);
    expect(result.readyForLinguisticReview).toBe(false);
    expect(result.issues.map((issue) => issue.field)).toContain('category');
  });

  it('connects all 20 real slice drafts to a publication-blocked review queue', () => {
    const drafts = JSON.parse(
      readFileSync(
        new URL(
          '../../../content/packs/learnbox-start/vocabulary/start-a1-vertical-slice-drafts.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as { batchId: string; items: LearningVocabularyItem[] };
    const actualManifest: ContentPackManifest = {
      id: 'learnbox_start_a1_essentials',
      version: 1,
      tierId: 'learnbox_start',
      displayName: 'LearnBox Start — German A1 Essentials',
      locale: 'de-DE',
      targetCefr: 'A1',
      targetItemCount: 350,
      releaseStatus: 'draft',
    };
    expect(
      prepareContentBatchForReview({
        batchId: drafts.batchId,
        manifest: actualManifest,
        expectedItemCount: 20,
        items: drafts.items,
      }),
    ).toMatchObject({
      state: 'awaiting_human_review',
      publicationBlocked: true,
      itemIds: expect.arrayContaining(['start-a1-haus', 'start-a1-entschuldigung']),
    });
  });
});
