import {
  evaluateAiSuggestion,
  type AiContentReviewDecision,
  type CefrLevel,
  type WordCardDraft,
} from '@learnbox/content-models';

export type ContentJobState = 'queued' | 'processing' | 'awaiting_review' | 'failed';

export interface ContentGenerationRequest {
  jobId: string;
  requestedAt: string;
  promptTemplateVersion: string;
  targetCefr: CefrLevel;
  lemmaHint?: string;
}

export interface ContentDraftJob {
  request: ContentGenerationRequest;
  state: ContentJobState;
  completedAt?: string;
}

export interface GeneratedCardProposal {
  jobId: string;
  card: WordCardDraft;
  confidence: number;
}

export interface CompletedContentDraftJob {
  job: ContentDraftJob;
  review: AiContentReviewDecision;
}

export function createContentDraftJob(request: ContentGenerationRequest): ContentDraftJob {
  if (!request.jobId.trim()) throw new Error('Content job ID is required.');
  if (!request.promptTemplateVersion.trim())
    throw new Error('Prompt template version is required.');
  if (Number.isNaN(new Date(request.requestedAt).getTime())) {
    throw new Error('Requested timestamp must be an ISO date.');
  }
  return { request, state: 'queued' };
}

export function startContentDraftJob(job: ContentDraftJob): ContentDraftJob {
  if (job.state !== 'queued') throw new Error('Only queued content jobs can start.');
  return { ...job, state: 'processing' };
}

/**
 * Provider output stops here. A result can only await editorial review; it cannot publish itself.
 */
export function completeContentDraftJob(
  job: ContentDraftJob,
  proposal: GeneratedCardProposal,
  completedAt: string,
): CompletedContentDraftJob {
  if (job.state !== 'processing') throw new Error('Only processing content jobs can complete.');
  if (proposal.jobId !== job.request.jobId)
    throw new Error('Proposal does not match its content job.');
  if (Number.isNaN(new Date(completedAt).getTime())) {
    throw new Error('Completion timestamp must be an ISO date.');
  }

  const review = evaluateAiSuggestion(proposal.card, proposal.confidence);
  return {
    job: { ...job, state: 'awaiting_review', completedAt },
    review,
  };
}
