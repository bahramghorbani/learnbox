import { describe, expect, it } from 'vitest';

import {
  completeContentDraftJob,
  createContentDraftJob,
  evaluateContentDraftProposal,
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

  it('routes a CEFR mismatch to human review even when the generated card is otherwise valid', () => {
    expect(
      evaluateContentDraftProposal(request, {
        jobId: request.jobId,
        card: { ...aiCard, cefr: 'A2' },
        confidence: 0.93,
      }),
    ).toMatchObject({
      nextStatus: 'needs_review',
      issues: [{ field: 'cefr' }],
      requiresHumanReview: true,
    });
  });

  it('keeps a matching CEFR proposal on the auto-validated path', () => {
    expect(
      evaluateContentDraftProposal(request, {
        jobId: request.jobId,
        card: aiCard,
        confidence: 0.93,
      }),
    ).toMatchObject({ nextStatus: 'auto_validated' });
  });

  it('rejects a content job without an id or prompt template', () => {
    expect(() => createContentDraftJob({ ...request, jobId: '   ' })).toThrow(
      'Content job ID is required.',
    );
    expect(() => createContentDraftJob({ ...request, promptTemplateVersion: '' })).toThrow(
      'Prompt template version is required.',
    );
  });

  it('rejects a content job with an invalid requested timestamp', () => {
    expect(() => createContentDraftJob({ ...request, requestedAt: 'not-a-date' })).toThrow(
      'Requested timestamp must be an ISO date.',
    );
  });

  it('only starts queued jobs and only completes processing jobs', () => {
    const job = createContentDraftJob(request);
    const started = startContentDraftJob(job);

    // Already-processing jobs cannot start again.
    expect(() => startContentDraftJob(started)).toThrow('Only queued content jobs can start.');
    // A queued job cannot complete directly.
    expect(() =>
      completeContentDraftJob(
        job,
        { jobId: request.jobId, card: aiCard, confidence: 0.93 },
        '2026-07-26T12:01:00.000Z',
      ),
    ).toThrow('Only processing content jobs can complete.');
  });

  it('rejects a completion with an invalid completion timestamp', () => {
    const started = startContentDraftJob(createContentDraftJob(request));
    expect(() =>
      completeContentDraftJob(
        started,
        { jobId: request.jobId, card: aiCard, confidence: 0.93 },
        'not-a-date',
      ),
    ).toThrow('Completion timestamp must be an ISO date.');
  });
});
