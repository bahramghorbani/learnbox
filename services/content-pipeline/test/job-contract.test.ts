import { describe, expect, it } from 'vitest';

import {
  completeContentDraftJob,
  createContentDraftJob,
  startContentDraftJob,
} from '../src/index.js';

const request = {
  jobId: 'job-haus-001',
  requestedAt: '2026-07-26T12:00:00.000Z',
  promptTemplateVersion: 'word-card-v1',
  targetCefr: 'A1' as const,
  lemmaHint: 'Haus',
};

const aiCard = {
  id: 'ai-haus-001',
  version: 1,
  status: 'ai_generated' as const,
  lemma: 'Haus',
  article: 'das' as const,
  partOfSpeech: 'noun' as const,
  cefr: 'A1' as const,
  persianMeanings: ['خانه'],
  examples: [{ german: 'Das Haus ist groß.', persian: 'خانه بزرگ است.' }],
  media: [],
  source: { provider: 'ai_suggestion' as const, reference: 'synthetic test fixture' },
};

describe('content draft job contract', () => {
  it('stops provider output at the human-review queue', () => {
    const started = startContentDraftJob(createContentDraftJob(request));
    const result = completeContentDraftJob(
      started,
      { jobId: request.jobId, card: aiCard, confidence: 0.93 },
      '2026-07-26T12:01:00.000Z',
    );

    expect(result.job.state).toBe('awaiting_review');
    expect(result.review).toMatchObject({
      nextStatus: 'auto_validated',
      requiresHumanReview: true,
    });
  });

  it('rejects a proposal that belongs to another job', () => {
    const started = startContentDraftJob(createContentDraftJob(request));
    expect(() =>
      completeContentDraftJob(
        started,
        { jobId: 'job-other', card: aiCard, confidence: 0.93 },
        '2026-07-26T12:01:00.000Z',
      ),
    ).toThrow('Proposal does not match its content job.');
  });
});
