import type { CardMediaKind, MediaKindState } from './CardMediaPanel';

/**
 * Whole-pack media completion (owner rules 2026-10-16).
 *
 * 1. `scanPackMedia` reads every card's media state (no provider call) and lists only media that is
 *    actually needed: the server's `needsGeneration` already excludes valid accepted media, a valid
 *    candidate awaiting acceptance and anything still generating.
 * 2. The Admin sees the counts — the paid-call estimate — and confirms a server-owned snapshot.
 *    A durable worker, not the browser, performs each later item. Nothing is ever accepted
 *    automatically.
 *
 * ponytail: this module scans only. The server-side job owns paid dispatch and recovery, so
 * closing a browser cannot decide whether another provider request starts.
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
