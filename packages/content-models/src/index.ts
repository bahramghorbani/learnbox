export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type ContentStatus = 'draft' | 'in_review' | 'approved' | 'published' | 'archived';
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

export interface ContentValidationIssue {
  field: string;
  message: string;
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
