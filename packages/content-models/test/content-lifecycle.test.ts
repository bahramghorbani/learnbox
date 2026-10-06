import { describe, expect, it } from 'vitest';

import {
  type CardPublishCandidate,
  type ContentStatus,
  type WordCardDraft,
  canArchivePackFrom,
  canPublishPackFrom,
  canSubmitCardForReview,
  evaluateCardPublishReadiness,
  evaluatePackPublishReadiness,
  isCardInReview,
  isPackLifecycleStatus,
  submitCardForReviewStatus,
  validateWordCard,
} from '../src/index.js';

function card(overrides: Partial<WordCardDraft> = {}): WordCardDraft {
  return {
    id: 'start-a1-apfel',
    version: 1,
    status: 'approved',
    lemma: 'Apfel',
    article: 'der',
    partOfSpeech: 'noun',
    cefr: 'A1',
    persianMeanings: ['سیب'],
    examples: [{ german: 'Der Apfel ist rot.', persian: 'سیب سرخ است.' }],
    media: [],
    source: { provider: 'editorial', reference: 'learnbox-start' },
    ...overrides,
  };
}

function candidate(overrides: Partial<CardPublishCandidate> = {}): CardPublishCandidate {
  const content = overrides.content ?? card();
  return {
    cardVersionId: '11111111-1111-5111-8111-111111111111',
    contentId: content.id,
    lemma: content.lemma,
    status: content.status,
    ...overrides,
    content,
  };
}

describe('pack lifecycle statuses', () => {
  it('recognises only the governed pack states', () => {
    for (const status of ['draft', 'needs_review', 'approved', 'published', 'archived']) {
      expect(isPackLifecycleStatus(status)).toBe(true);
    }
    expect(isPackLifecycleStatus('staging')).toBe(false);
    expect(isPackLifecycleStatus(undefined)).toBe(false);
  });

  it('allows release only from an editorial state', () => {
    expect(canPublishPackFrom('draft')).toBe(true);
    expect(canPublishPackFrom('needs_review')).toBe(true);
    expect(canPublishPackFrom('approved')).toBe(true);
    expect(canPublishPackFrom('published')).toBe(false);
    expect(canPublishPackFrom('archived')).toBe(false);
  });

  it('allows archiving anything that is not already archived', () => {
    expect(canArchivePackFrom('published')).toBe(true);
    expect(canArchivePackFrom('draft')).toBe(true);
    expect(canArchivePackFrom('archived')).toBe(false);
  });
});

describe('draft to review transition', () => {
  it('submits authored and AI-applied drafts into the human queue', () => {
    expect(canSubmitCardForReview('draft')).toBe(true);
    expect(canSubmitCardForReview('ai_generated')).toBe(true);
    expect(submitCardForReviewStatus('draft')).toBe('needs_review');
    expect(submitCardForReviewStatus('ai_generated')).toBe('needs_review');
  });

  it('never lets automation skip review by resubmitting a decided card', () => {
    for (const status of ['approved', 'published', 'rejected', 'needs_review'] as ContentStatus[]) {
      expect(canSubmitCardForReview(status)).toBe(false);
      expect(() => submitCardForReviewStatus(status)).toThrow(/submitted for review/);
    }
  });

  it('reports the review queue statuses the review store owns', () => {
    expect(isCardInReview('needs_review')).toBe(true);
    expect(isCardInReview('auto_validated')).toBe(true);
    expect(isCardInReview('draft')).toBe(false);
    expect(isCardInReview('approved')).toBe(false);
  });
});

describe('card publish readiness', () => {
  it('releases an approved, contract-clean card', () => {
    expect(evaluateCardPublishReadiness(candidate())).toBeNull();
  });

  it('blocks every status that is not editorially approved', () => {
    for (const status of [
      'draft',
      'ai_generated',
      'auto_validated',
      'needs_review',
      'rejected',
      'published',
      'deprecated',
    ] as ContentStatus[]) {
      const blocker = evaluateCardPublishReadiness(
        candidate({ content: card({ status }), status }),
      );
      expect(blocker?.code).toBe('not_approved');
      expect(blocker?.status).toBe(status);
    }
  });

  it('blocks an approved card whose persisted content fails the published contract', () => {
    const blocker = evaluateCardPublishReadiness(
      candidate({ content: card({ persianMeanings: [] }) }),
    );
    expect(blocker?.code).toBe('invalid_content');
    expect(blocker?.issues.some((issue) => issue.field === 'persianMeanings')).toBe(true);
  });

  it('blocks publishing media that has not passed quality review', () => {
    const blocker = evaluateCardPublishReadiness(
      candidate({
        content: card({
          media: [
            {
              assetId: 'img-1',
              version: 1,
              kind: 'image',
              url: 'https://media.learnboxapp.com/img-1.png',
              qualityStatus: 'pending',
            },
          ],
        }),
      }),
    );
    expect(blocker?.code).toBe('invalid_content');
    expect(blocker?.issues.some((issue) => issue.field === 'media.qualityStatus')).toBe(true);
  });

  it('blocks AI-sourced content that carries no recorded human reviewer', () => {
    const blocker = evaluateCardPublishReadiness(
      candidate({
        content: card({ source: { provider: 'ai_suggestion', reference: 'avalai' } }),
      }),
    );
    expect(blocker?.code).toBe('unreviewed_ai_content');
  });

  it('releases AI-sourced content once a human reviewer is recorded, keeping provenance', () => {
    const content = card({
      source: {
        provider: 'ai_suggestion',
        reference: 'avalai',
        reviewedBy: '22222222-2222-5222-8222-222222222222',
      },
    });
    expect(evaluateCardPublishReadiness(candidate({ content }))).toBeNull();
    expect(content.source.provider).toBe('ai_suggestion');
  });

  it('keeps the AI publish rule unsatisfiable by whitespace', () => {
    const issues = validateWordCard({
      ...card({ status: 'published', source: { provider: 'ai_suggestion', reviewedBy: '   ' } }),
    });
    expect(issues.some((issue) => issue.field === 'source')).toBe(true);
  });
});

describe('pack publish readiness', () => {
  const ready = () => ({
    packStatus: 'approved' as const,
    targetItemCount: 2,
    cards: [
      candidate({ content: card({ id: 'start-a1-apfel' }) }),
      candidate({ content: card({ id: 'start-a1-milch', lemma: 'Milch', article: 'die' }) }),
    ],
  });

  it('is ready when the pack is complete and every card is releasable', () => {
    const readiness = evaluatePackPublishReadiness(ready());
    expect(readiness.ready).toBe(true);
    expect(readiness.blockers).toHaveLength(0);
    expect(readiness.cardBlockers).toHaveLength(0);
    expect(readiness.publishableCardCount).toBe(2);
  });

  it('refuses to republish or revive without an explicit lifecycle move', () => {
    for (const packStatus of ['published', 'archived'] as const) {
      const readiness = evaluatePackPublishReadiness({ ...ready(), packStatus });
      expect(readiness.ready).toBe(false);
      expect(readiness.blockers.some((blocker) => blocker.code === 'pack_not_publishable')).toBe(
        true,
      );
    }
  });

  it('refuses an empty pack', () => {
    const readiness = evaluatePackPublishReadiness({
      packStatus: 'approved',
      targetItemCount: 0,
      cards: [],
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.some((blocker) => blocker.code === 'pack_empty')).toBe(true);
  });

  it('reports a declared composition shortfall with both counts', () => {
    const readiness = evaluatePackPublishReadiness({ ...ready(), targetItemCount: 35 });
    expect(readiness.ready).toBe(false);
    const blocker = readiness.blockers.find((entry) => entry.code === 'pack_incomplete');
    expect(blocker).toMatchObject({ expectedItemCount: 35, actualItemCount: 2 });
  });

  it('ignores composition when the pack declares no fixed item count', () => {
    const readiness = evaluatePackPublishReadiness({ ...ready(), targetItemCount: 0 });
    expect(readiness.ready).toBe(true);
  });

  it('blocks the whole pack when a single card is not ready, and names it', () => {
    const base = ready();
    const readiness = evaluatePackPublishReadiness({
      ...base,
      cards: [
        base.cards[0]!,
        candidate({ content: card({ id: 'start-a1-milch', status: 'needs_review' }) }),
      ],
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.some((blocker) => blocker.code === 'cards_not_ready')).toBe(true);
    expect(readiness.cardBlockers).toHaveLength(1);
    expect(readiness.cardBlockers[0]).toMatchObject({
      contentId: 'start-a1-milch',
      code: 'not_approved',
    });
    expect(readiness.publishableCardCount).toBe(1);
  });
});
