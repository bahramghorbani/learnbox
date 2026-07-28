export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type ContentStatus =
  | 'draft'
  | 'ai_generated'
  | 'auto_validated'
  | 'needs_review'
  | 'approved'
  | 'published'
  | 'deprecated'
  | 'rejected';
export type PartOfSpeech = 'noun' | 'verb' | 'adjective' | 'adverb' | 'phrase' | 'other';

export interface VersionedMediaAsset {
  assetId: string;
  version: number;
  kind: 'image' | 'word_audio' | 'sentence_audio';
  url: string;
  qualityStatus: 'pending' | 'approved' | 'rejected';
}

export interface ExampleSentence {
  german: string;
  persian: string;
}

export interface WordCardDraft {
  id: string;
  version: number;
  status: ContentStatus;
  lemma: string;
  article?: 'der' | 'die' | 'das';
  partOfSpeech: PartOfSpeech;
  cefr: CefrLevel;
  persianMeanings: string[];
  examples: ExampleSentence[];
  media: VersionedMediaAsset[];
  source: { provider: 'editorial' | 'user' | 'ai_suggestion'; reference?: string };
}

/**
 * The production contract for pack vocabulary. It deliberately extends the existing card draft
 * instead of replacing it, so current review flows remain compatible while the factory grows.
 */
export interface LearningVocabularyItem extends WordCardDraft {
  normalizedLemma: string;
  simpleGermanDefinition: string;
  essentialInflection?: string;
  pronunciation?: { ipa?: string; locale: 'de-DE' };
  grammarNote: string;
  topicTags: string[];
  difficulty: 1 | 2 | 3 | 4 | 5;
  visualConcept: string;
  imagePrompt: string;
  provenance: {
    sourceType: 'editorial' | 'licensed_source' | 'ai_assisted';
    sourceReference: string;
    reviewedBy?: string;
  };
  mediaQa?: VocabularyMediaQa;
}

export type VocabularyVisualSemanticRole =
  'action_or_emotion' | 'concrete_noun' | 'place' | 'abstract';
export type BoboImageRole = 'absent' | 'supporting' | 'primary';

export interface VocabularyMediaQa {
  visual: {
    semanticRole: VocabularyVisualSemanticRole;
    boboRole: BoboImageRole;
    boboCanonicalVersion?: '1.0.0';
    semanticAccurate: boolean;
    primaryConceptClear: boolean;
    mobileReadable: boolean;
    hasGeneratedText: boolean;
    hasWatermark: boolean;
    hasUnnecessaryClutter: boolean;
  };
  audio: {
    wordAudioVerified: boolean;
    sentenceAudioVerified: boolean;
    noTruncationOrDistortion: boolean;
  };
}

export interface ContentPackManifest {
  id: string;
  version: number;
  tierId: 'learnbox_start' | 'learnbox_plus';
  displayName: string;
  locale: 'de-DE';
  targetCefr: CefrLevel;
  targetItemCount: number;
  releaseStatus: 'draft' | 'staging' | 'published' | 'deprecated';
}

export interface ContentValidationIssue {
  field: string;
  message: string;
}

export interface AiContentReviewDecision {
  nextStatus: 'auto_validated' | 'needs_review';
  confidence: number;
  issues: ContentValidationIssue[];
  requiresHumanReview: true;
}

export type ContentReviewAction = 'approve' | 'return_for_revision' | 'reject';

export interface ContentReviewTransition {
  nextStatus: 'approved' | 'needs_review' | 'rejected';
  action: ContentReviewAction;
  requiresPublisher: boolean;
}

export function validateWordCard(card: WordCardDraft): ContentValidationIssue[] {
  const issues: ContentValidationIssue[] = [];
  if (!card.id.trim()) issues.push({ field: 'id', message: 'شناسهٔ کارت الزامی است.' });
  if (!Number.isInteger(card.version) || card.version < 1) {
    issues.push({ field: 'version', message: 'نسخه باید عدد صحیحِ مثبت باشد.' });
  }
  if (!card.lemma.trim()) issues.push({ field: 'lemma', message: 'واژهٔ آلمانی الزامی است.' });
  if (
    card.persianMeanings.length === 0 ||
    card.persianMeanings.some((meaning) => !meaning.trim())
  ) {
    issues.push({ field: 'persianMeanings', message: 'حداقل یک معنی فارسیِ معتبر لازم است.' });
  }
  if (card.examples.some((example) => !example.german.trim() || !example.persian.trim())) {
    issues.push({ field: 'examples', message: 'مثال باید آلمانی و ترجمهٔ فارسی داشته باشد.' });
  }
  const assetIds = new Set<string>();
  for (const asset of card.media) {
    if (!asset.assetId.trim() || !asset.url.startsWith('https://')) {
      issues.push({ field: 'media', message: 'رسانه باید شناسه و نشانی HTTPS داشته باشد.' });
    }
    if (!Number.isInteger(asset.version) || asset.version < 1) {
      issues.push({ field: 'media.version', message: 'نسخهٔ رسانه باید عدد صحیحِ مثبت باشد.' });
    }
    if (assetIds.has(asset.assetId)) {
      issues.push({ field: 'media', message: 'شناسهٔ رسانه نباید تکراری باشد.' });
    }
    assetIds.add(asset.assetId);
  }
  if (
    card.status === 'published' &&
    card.media.some((asset) => asset.qualityStatus !== 'approved')
  ) {
    issues.push({
      field: 'media.qualityStatus',
      message: 'محتوای منتشرشده فقط رسانهٔ تأییدشده می‌پذیرد.',
    });
  }
  if (card.source.provider === 'ai_suggestion' && card.status === 'published') {
    issues.push({ field: 'source', message: 'پیشنهاد AI بدون بازبینی انسانی منتشر نمی‌شود.' });
  }
  return issues;
}

export function validateLearningVocabularyItem(
  item: LearningVocabularyItem,
): ContentValidationIssue[] {
  const issues = validateWordCard(item);
  if (!item.normalizedLemma.trim()) {
    issues.push({ field: 'normalizedLemma', message: 'صورتِ نرمال‌شدهٔ مدخل الزامی است.' });
  }
  if (!item.simpleGermanDefinition.trim()) {
    issues.push({ field: 'simpleGermanDefinition', message: 'تعریف سادهٔ آلمانی الزامی است.' });
  }
  if (!item.grammarNote.trim()) {
    issues.push({ field: 'grammarNote', message: 'یادداشت دستوری الزامی است.' });
  }
  if (item.topicTags.length === 0 || item.topicTags.some((tag) => !tag.trim())) {
    issues.push({ field: 'topicTags', message: 'حداقل یک برچسب موضوعیِ معتبر لازم است.' });
  }
  if (!Number.isInteger(item.difficulty) || item.difficulty < 1 || item.difficulty > 5) {
    issues.push({ field: 'difficulty', message: 'درجهٔ سختی باید عددی بین ۱ و ۵ باشد.' });
  }
  if (!item.visualConcept.trim() || !item.imagePrompt.trim()) {
    issues.push({ field: 'visual', message: 'مفهوم بصری و راهنمای تصویر الزامی‌اند.' });
  }
  if (!item.provenance.sourceReference.trim()) {
    issues.push({ field: 'provenance', message: 'منبع یا مرجع تولید محتوا الزامی است.' });
  }
  if (item.mediaQa) issues.push(...validateVocabularyMediaQa(item.mediaQa));
  if (item.status === 'published' && !item.mediaQa) {
    issues.push({ field: 'mediaQa', message: 'محتوای منتشرشده به تأیید تصویر و صدا نیاز دارد.' });
  }
  return issues;
}

/**
 * A media QA pass enforces the approved Bobo vocabulary policy before a card can be released.
 * It is intentionally provider-free and only validates recorded reviewer observations.
 */
export function validateVocabularyMediaQa(qa: VocabularyMediaQa): ContentValidationIssue[] {
  const issues: ContentValidationIssue[] = [];
  const { visual, audio } = qa;
  if (!visual.semanticAccurate || !visual.primaryConceptClear || !visual.mobileReadable) {
    issues.push({
      field: 'mediaQa.visual',
      message: 'معنا، مفهوم اصلی و خوانایی کارت باید تأیید شوند.',
    });
  }
  if (visual.hasGeneratedText || visual.hasWatermark || visual.hasUnnecessaryClutter) {
    issues.push({
      field: 'mediaQa.visual',
      message: 'تصویر نباید متن، واترمارک یا شلوغی غیرضروری داشته باشد.',
    });
  }
  if (
    visual.boboRole !== 'absent' &&
    (visual.boboCanonicalVersion !== '1.0.0' ||
      (visual.semanticRole !== 'action_or_emotion' && visual.boboRole === 'primary'))
  ) {
    issues.push({
      field: 'mediaQa.visual.bobo',
      message: 'بوبو باید نسخهٔ رسمی باشد و در اسم‌ها و مکان‌ها موضوع اصلی تصویر نباشد.',
    });
  }
  if (!audio.wordAudioVerified || !audio.sentenceAudioVerified || !audio.noTruncationOrDistortion) {
    issues.push({
      field: 'mediaQa.audio',
      message: 'صدای واژه و مثال باید کامل و تأییدشده باشند.',
    });
  }
  return issues;
}

/**
 * Deterministic gate for an AI suggestion. Passing automation never publishes a card:
 * it only makes it eligible for an editor's explicit approval.
 */
export function evaluateAiSuggestion(
  card: WordCardDraft,
  confidence: number,
): AiContentReviewDecision {
  const issues = validateWordCard(card);
  if (card.source.provider !== 'ai_suggestion') {
    issues.push({ field: 'source', message: 'این دروازه فقط برای پیشنهادهای AI است.' });
  }
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    issues.push({ field: 'confidence', message: 'اطمینان باید عددی بین صفر و یک باشد.' });
  }

  return {
    nextStatus: issues.length === 0 && confidence >= 0.85 ? 'auto_validated' : 'needs_review',
    confidence,
    issues,
    requiresHumanReview: true,
  };
}

/** A reviewer can approve editorial readiness, but only a separate publisher may release it. */
export function transitionContentReview(
  currentStatus: ContentStatus,
  action: ContentReviewAction,
): ContentReviewTransition {
  if (currentStatus !== 'auto_validated' && currentStatus !== 'needs_review') {
    throw new Error('Only review-queue content can receive a review decision.');
  }
  if (action === 'approve') {
    return { nextStatus: 'approved', action, requiresPublisher: true };
  }
  return {
    nextStatus: action === 'reject' ? 'rejected' : 'needs_review',
    action,
    requiresPublisher: false,
  };
}

export * from './content-pack-release.js';
