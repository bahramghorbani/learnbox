import type { CardMediaKind, MediaKindState } from './CardMediaPanel';

/**
 * Whole-pack media completion (owner rules 2026-10-16).
 *
 * 1. `scanPackMedia` reads every card's media state (no provider call) and lists only media that is
 *    actually needed: the server's `needsGeneration` already excludes valid accepted media, a valid
 *    candidate awaiting acceptance and anything still generating.
 * 2. The Admin sees the counts — the paid-call estimate — and confirms before anything runs.
 * 3. `runPackMedia` generates the confirmed items one at a time through the existing guarded
 *    per-card route and records each outcome. The first failure stops the run (a provider outage
 *    must not turn into a string of paid attempts); the failed and not-yet-run items are then
 *    resumed on their own. Nothing is ever accepted automatically.
 *
 * ponytail: runs in the open Admin tab, one request in flight. Leaving the panel permits an
 * already-sent request to finish at the server, but stops this runner before a further paid call.
 * Progress is durable because every candidate is a database row; a new scan picks up exactly what
 * is still needed. Move to a server-side job if packs outgrow one sitting.
 */

export const MEDIA_KIND_ORDER: readonly CardMediaKind[] = ['image', 'word_audio', 'sentence_audio'];

export type PackMediaItem = { cardId: string; label: string; kind: CardMediaKind };

export interface PackMediaScan {
  /** Media to generate: paid calls, run only after confirmation. */
  needed: PackMediaItem[];
  /** Valid candidates waiting for a human to accept them. */
  awaitingAcceptance: PackMediaItem[];
  /** Still generating from an earlier request; never started again. */
  generating: PackMediaItem[];
  /** Accepted media whose provenance cannot be proven: an owner decision, never auto-regenerated. */
  unverifiable: PackMediaItem[];
  /** Cards whose state could not be read; reported, never guessed. */
  unreadable: { cardId: string; label: string }[];
}

export type PackMediaResult = PackMediaItem & {
  status: 'generated' | 'not_needed' | 'failed' | 'stopped';
  message: string;
};

type MediaState = MediaKindState & {
  needsGeneration?: boolean;
  latestValidity?: string | null;
  acceptedValidity?: string | null;
};

export async function scanPackMedia(
  cards: { cardId: string; label: string }[],
  loadState: (cardId: string) => Promise<MediaKindState[] | undefined>,
): Promise<PackMediaScan> {
  const scan: PackMediaScan = {
    needed: [],
    awaitingAcceptance: [],
    generating: [],
    unverifiable: [],
    unreadable: [],
  };
  for (const card of cards) {
    const states = (await loadState(card.cardId)) as MediaState[] | undefined;
    if (!states) {
      scan.unreadable.push(card);
      continue;
    }
    for (const kind of MEDIA_KIND_ORDER) {
      const state = states.find((entry) => entry.kind === kind);
      const item = { ...card, kind };
      if (state?.latestCandidate?.status === 'generating') scan.generating.push(item);
      else if (state?.latestCandidate?.status === 'ready' && state.latestValidity === 'valid')
        scan.awaitingAcceptance.push(item);
      else if (state?.acceptedValidity === 'unverifiable') scan.unverifiable.push(item);
      else if (state?.needsGeneration) scan.needed.push(item);
    }
  }
  return scan;
}

export async function runPackMedia(
  items: PackMediaItem[],
  {
    generate,
    onResult,
    shouldContinue = () => true,
  }: {
    generate: (
      cardId: string,
      kind: CardMediaKind,
    ) => Promise<{ ok: boolean; status?: string; message?: string; code?: string }>;
    onResult: (result: PackMediaResult) => void;
    /** Panel lifetime guard: never begin a second paid request after the panel was left. */
    shouldContinue?: () => boolean;
  },
): Promise<void> {
  for (let index = 0; index < items.length; index += 1) {
    if (!shouldContinue()) return;
    const item = items[index]!;
    const result = await generate(item.cardId, item.kind);
    // An already-sent HTTP request may finish after unmount. Its durable server-side candidate is
    // recovered by the next scan, but this tab must not continue to another paid request.
    if (!shouldContinue()) return;
    if (result.ok) {
      const notNeeded = result.status === 'not_needed';
      onResult({
        ...item,
        status: notNeeded ? 'not_needed' : 'generated',
        message: notNeeded
          ? 'رسانهٔ معتبر از قبل وجود دارد؛ دوباره ساخته نشد.'
          : 'پیشنهاد ساخته شد و باید دستی پذیرفته شود.',
      });
      continue;
    }
    onResult({ ...item, status: 'failed', message: result.message ?? 'تولید ناموفق بود.' });
    for (const rest of items.slice(index + 1)) {
      onResult({ ...rest, status: 'stopped', message: 'اجرا پیش از این مورد متوقف شد.' });
    }
    return;
  }
}

/** Items a resumed run picks up: the failure and everything the stop left untouched. */
export function resumableItems(results: readonly PackMediaResult[]): PackMediaItem[] {
  return results
    .filter((result) => result.status === 'failed' || result.status === 'stopped')
    .map(({ cardId, label, kind }) => ({ cardId, label, kind }));
}
