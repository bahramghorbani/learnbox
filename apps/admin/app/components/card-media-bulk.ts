import type { CardMediaKind, MediaKindState } from './CardMediaPanel';

export const BULK_MEDIA_CARD_CAP = 25;
const VOICE_ROSTER_CODES = new Set([
  'das_voice_unconfigured',
  'article_voices_not_distinct',
  'voice_not_supported',
  'audio_model_not_qualified',
]);
export type BulkMediaKind = 'image' | 'audio';
export type BulkMediaResult = {
  cardId: string;
  label: string;
  status: 'generated' | 'skipped' | 'blocked' | 'failed';
  message: string;
};

type Card = { cardId: string; label: string };
type Dependencies = {
  loadState: (cardId: string) => Promise<MediaKindState[] | undefined>;
  generate: (
    cardId: string,
    kind: CardMediaKind,
  ) => Promise<{ ok: boolean; message?: string; code?: string }>;
  onResult: (result: BulkMediaResult) => void;
};

/** Single-flight client runner: every request uses the existing guarded per-card route. */
export async function runBulkCardMediaGeneration(
  cards: Card[],
  kind: BulkMediaKind,
  { loadState, generate, onResult }: Dependencies,
): Promise<void> {
  const candidateKind: CardMediaKind = kind === 'image' ? 'image' : 'word_audio';
  for (const card of cards.slice(0, BULK_MEDIA_CARD_CAP)) {
    const media = await loadState(card.cardId);
    const state = media?.find((item) => item.kind === candidateKind);
    if (
      state?.accepted ||
      state?.latestCandidate?.status === 'generating' ||
      state?.latestCandidate?.status === 'ready'
    ) {
      onResult({
        cardId: card.cardId,
        label: card.label,
        status: 'skipped',
        message: 'رسانهٔ پذیرفته‌شده یا نامزدِ در انتظار بررسی وجود دارد.',
      });
      continue;
    }
    const result = await generate(card.cardId, candidateKind);
    if (!result.ok) {
      // A voice-roster problem blocks every card the same way, so the run stops at the first one.
      onResult({
        cardId: card.cardId,
        label: card.label,
        status: result.code && VOICE_ROSTER_CODES.has(result.code) ? 'blocked' : 'failed',
        message: result.message ?? 'تولید رسانه متوقف شد.',
      });
      return;
    }
    onResult({
      cardId: card.cardId,
      label: card.label,
      status: 'generated',
      message: 'نامزد تولید شد و هنوز باید دستی پذیرفته شود.',
    });
  }
}
