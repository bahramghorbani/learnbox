import {
  validateLearningVocabularyItem,
  type ContentPackManifest,
  type ContentValidationIssue,
  type LearningVocabularyItem,
} from '@learnbox/content-models';

export interface ContentBatchInput {
  batchId: string;
  manifest: ContentPackManifest;
  expectedItemCount: number;
  items: LearningVocabularyItem[];
}

export interface ContentBatchValidation {
  batchId: string;
  readyForHumanReview: boolean;
  issues: ContentValidationIssue[];
}

export type StartSliceCandidateCategory =
  'household_noun' | 'food_drink' | 'place' | 'verb' | 'adjective_emotion' | 'daily_expression';

export interface SourceCandidate {
  candidateId: string;
  lemmaHint: string;
  category: StartSliceCandidateCategory;
  selectionRationale: string;
  sourceUrl: string;
  sourceEntryVerification: 'pending_linguistic_review' | 'verified';
}

export interface SourceCandidateValidation {
  readyForLinguisticReview: boolean;
  issues: ContentValidationIssue[];
}

const requiredStartSliceCategories: StartSliceCandidateCategory[] = [
  'household_noun',
  'food_drink',
  'place',
  'verb',
  'adjective_emotion',
  'daily_expression',
];

/** Normalization is deterministic so duplicate checks do not depend on a content provider. */
export function normalizeGermanLemma(lemma: string): string {
  return lemma.trim().toLocaleLowerCase('de-DE').replaceAll(/\s+/g, ' ');
}

export function findDuplicateContentIds(items: ReadonlyArray<LearningVocabularyItem>): string[] {
  const idsByLemma = new Map<string, string[]>();
  for (const item of items) {
    const normalized = normalizeGermanLemma(item.normalizedLemma || item.lemma);
    idsByLemma.set(normalized, [...(idsByLemma.get(normalized) ?? []), item.id]);
  }
  return [...idsByLemma.values()].filter((ids) => ids.length > 1).flat();
}

/** Candidate intake deliberately contains no learner-facing definition, translation, media or publish state. */
export function validateStartSliceCandidates(
  candidates: ReadonlyArray<SourceCandidate>,
  expectedItemCount = 20,
): SourceCandidateValidation {
  const issues: ContentValidationIssue[] = [];
  if (candidates.length !== expectedItemCount) {
    issues.push({ field: 'candidates', message: 'تعداد نامزدها با هدف برش اولیه برابر نیست.' });
  }
  const ids = new Set<string>();
  const lemmas = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate.candidateId.trim() || ids.has(candidate.candidateId)) {
      issues.push({ field: 'candidateId', message: 'شناسهٔ نامزد الزامی و یکتا است.' });
    }
    ids.add(candidate.candidateId);
    const normalized = normalizeGermanLemma(candidate.lemmaHint);
    if (!normalized || lemmas.has(normalized)) {
      issues.push({ field: 'lemmaHint', message: 'مدخلِ نامزد الزامی و بدون تکرار است.' });
    }
    lemmas.add(normalized);
    if (!candidate.selectionRationale.trim() || !candidate.sourceUrl.startsWith('https://')) {
      issues.push({ field: 'source', message: 'دلیل انتخاب و مرجع HTTPS الزامی است.' });
    }
  }
  for (const category of requiredStartSliceCategories) {
    if (!candidates.some((candidate) => candidate.category === category)) {
      issues.push({ field: 'category', message: `گروه ضروریِ برش اولیه موجود نیست: ${category}` });
    }
  }
  return { readyForLinguisticReview: issues.length === 0, issues };
}

/**
 * A valid batch is ready only for a human queue. It has no publish capability and makes no
 * external AI, image, audio or payment request.
 */
export function validateContentBatch(input: ContentBatchInput): ContentBatchValidation {
  const issues: ContentValidationIssue[] = [];
  if (!input.batchId.trim()) issues.push({ field: 'batchId', message: 'شناسهٔ بچ الزامی است.' });
  if (!Number.isInteger(input.expectedItemCount) || input.expectedItemCount < 1) {
    issues.push({ field: 'expectedItemCount', message: 'تعداد هدفِ بچ معتبر نیست.' });
  }
  if (input.items.length !== input.expectedItemCount) {
    issues.push({
      field: 'items',
      message: 'تعداد کارت‌های بچ با تعداد هدف برابر نیست.',
    });
  }
  if (input.manifest.releaseStatus !== 'draft' && input.manifest.releaseStatus !== 'staging') {
    issues.push({
      field: 'manifest.releaseStatus',
      message: 'فقط بستهٔ پیش‌نویس یا آزمایشی قابل بررسی است.',
    });
  }
  const duplicateIds = findDuplicateContentIds(input.items);
  if (duplicateIds.length) {
    issues.push({
      field: 'items.normalizedLemma',
      message: `مدخلِ تکراری در کارت‌ها: ${duplicateIds.join(', ')}`,
    });
  }
  for (const item of input.items) {
    for (const issue of validateLearningVocabularyItem(item)) {
      issues.push({ field: `${item.id}.${issue.field}`, message: issue.message });
    }
  }
  return { batchId: input.batchId, readyForHumanReview: issues.length === 0, issues };
}
