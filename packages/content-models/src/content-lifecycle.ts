import {
  type ContentStatus,
  type ContentValidationIssue,
  type WordCardDraft,
  validateWordCard,
} from './index.js';

/**
 * Canonical LearnBox content lifecycle rules (M1.6).
 *
 * This module is the single runtime source of truth for how authored content reaches learners:
 *
 *   draft / ai_generated -> needs_review -> approved -> published -> deprecated
 *
 * It lives in the domain layer, not in an Admin route, because the learner read model keys on
 * exactly these statuses. The Web learner curriculum requires BOTH `packs.status = 'published'`
 * and `card_versions.status = 'published'`, so "publish" is the only operation that can make
 * content learner-visible and it must stay governed by one rule set.
 *
 * Relationship to `content-pack-release.ts`: that module evaluates a repository CONTENT MANIFEST
 * (`ContentPackManifest` + `LearningVocabularyItem[]`). This module evaluates the PERSISTED
 * database lifecycle. They intentionally enforce the same five release rules — publisher role,
 * pre-publish pack state, pack item completeness, every card editorially approved, and every card
 * passing the published-card contract — so there is one standard expressed over two input shapes.
 *
 * Media QA. The manifest path demands a `mediaQa` record on a published item. The database path
 * proves the same human verification differently and does not synthesise that record: a card can
 * only reach `approved` after a reviewer has passed all six canonical review dimensions, which
 * include `visual` and `audio`. Approval therefore *is* the persisted image/audio attestation.
 * Fabricating a granular `mediaQa` object from a coarse dimension pass would invent reviewer
 * observations that nobody made, so this module relies on `approved` plus the card contract in
 * `validateWordCard`, which already refuses published content carrying unapproved media.
 */

/** Pack lifecycle states. `packs.status` is canonical free text; these are the governed values. */
export type PackLifecycleStatus = 'draft' | 'needs_review' | 'approved' | 'published' | 'archived';

export const packLifecycleStatuses: readonly PackLifecycleStatus[] = [
  'draft',
  'needs_review',
  'approved',
  'published',
  'archived',
];

export function isPackLifecycleStatus(value: unknown): value is PackLifecycleStatus {
  return typeof value === 'string' && packLifecycleStatuses.includes(value as PackLifecycleStatus);
}

/**
 * Statuses that may be submitted for human review. Authored and AI-applied cards both land in
 * `draft`, so both enter the same queue; neither can skip it.
 */
const submittableCardStatuses: ReadonlySet<ContentStatus> = new Set<ContentStatus>([
  'draft',
  'ai_generated',
]);

export function canSubmitCardForReview(status: ContentStatus): boolean {
  return submittableCardStatuses.has(status);
}

/** Statuses the review queue owns. Mirrors the review store's reviewable set. */
const reviewQueueStatuses: ReadonlySet<ContentStatus> = new Set<ContentStatus>([
  'auto_validated',
  'needs_review',
]);

export function isCardInReview(status: ContentStatus): boolean {
  return reviewQueueStatuses.has(status);
}

/**
 * Editorial review always precedes release, and a submitted card always requires a human. There is
 * deliberately no automated path from `draft` to `approved`.
 */
export function submitCardForReviewStatus(current: ContentStatus): ContentStatus {
  if (!canSubmitCardForReview(current)) {
    throw new Error('Only draft or AI-generated content can be submitted for review.');
  }
  return 'needs_review';
}

export type CardPublishBlockerCode =
  /** Not editorially approved, so the six review dimensions have not all passed. */
  | 'not_approved'
  /** Approved, but the persisted content fails the published-card contract. */
  | 'invalid_content'
  /** AI-sourced content with no recorded human reviewer. */
  | 'unreviewed_ai_content';

export interface CardPublishBlocker {
  cardVersionId: string;
  contentId: string;
  lemma: string;
  code: CardPublishBlockerCode;
  status: ContentStatus;
  issues: ContentValidationIssue[];
}

export interface CardPublishCandidate {
  cardVersionId: string;
  contentId: string;
  lemma: string;
  status: ContentStatus;
  content: WordCardDraft;
}

/**
 * Evaluates one card against the published-card contract. Returns `null` when the card may be
 * released. The card is validated *as published* so that the release-only rules in
 * `validateWordCard` (approved media only, no unreviewed AI content) actually run.
 */
export function evaluateCardPublishReadiness(
  candidate: CardPublishCandidate,
): CardPublishBlocker | null {
  const base = {
    cardVersionId: candidate.cardVersionId,
    contentId: candidate.contentId,
    lemma: candidate.lemma,
    status: candidate.status,
  };

  if (candidate.status !== 'approved') {
    return { ...base, code: 'not_approved', issues: [] };
  }

  const issues = validateWordCard({ ...candidate.content, status: 'published' });
  if (issues.length === 0) return null;

  const unreviewedAi = issues.some((issue) => issue.field === 'source');
  return {
    ...base,
    code: unreviewedAi ? 'unreviewed_ai_content' : 'invalid_content',
    issues,
  };
}

export type PackPublishBlockerCode =
  'pack_not_publishable' | 'pack_empty' | 'pack_incomplete' | 'cards_not_ready';

export interface PackPublishBlocker {
  code: PackPublishBlockerCode;
  /** Present on `pack_incomplete`, so an operator sees the shortfall without reading rows. */
  expectedItemCount?: number;
  actualItemCount?: number;
}

export interface PackPublishReadinessInput {
  packStatus: PackLifecycleStatus;
  /** `packs.target_item_count`. Zero or negative means the pack declares no fixed composition. */
  targetItemCount: number;
  cards: CardPublishCandidate[];
}

export interface PackPublishReadiness {
  ready: boolean;
  packStatus: PackLifecycleStatus;
  publishableCardCount: number;
  blockers: PackPublishBlocker[];
  cardBlockers: CardPublishBlocker[];
}

/** A pack may be released from an editorial state, never from an archived or already-live one. */
export function canPublishPackFrom(status: PackLifecycleStatus): boolean {
  return status === 'draft' || status === 'needs_review' || status === 'approved';
}

/** Archiving is the non-destructive deactivation path and is always reversible by republishing. */
export function canArchivePackFrom(status: PackLifecycleStatus): boolean {
  return status !== 'archived';
}

/**
 * The database-side mirror of `evaluateContentPackReleaseReadiness`. Role authorisation is checked
 * by the caller against the persisted admin role, since only the server knows the actor.
 */
export function evaluatePackPublishReadiness(
  input: PackPublishReadinessInput,
): PackPublishReadiness {
  const blockers: PackPublishBlocker[] = [];
  const cardBlockers: CardPublishBlocker[] = [];

  if (!canPublishPackFrom(input.packStatus)) {
    blockers.push({ code: 'pack_not_publishable' });
  }
  if (input.cards.length === 0) {
    blockers.push({ code: 'pack_empty' });
  }
  if (
    Number.isInteger(input.targetItemCount) &&
    input.targetItemCount > 0 &&
    input.cards.length !== input.targetItemCount
  ) {
    blockers.push({
      code: 'pack_incomplete',
      expectedItemCount: input.targetItemCount,
      actualItemCount: input.cards.length,
    });
  }

  for (const card of input.cards) {
    const blocker = evaluateCardPublishReadiness(card);
    if (blocker) cardBlockers.push(blocker);
  }
  if (cardBlockers.length > 0) {
    blockers.push({ code: 'cards_not_ready' });
  }

  return {
    ready: blockers.length === 0,
    packStatus: input.packStatus,
    publishableCardCount: input.cards.length - cardBlockers.length,
    blockers,
    cardBlockers,
  };
}
