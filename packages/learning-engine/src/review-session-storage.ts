import type { DeviceStorage } from './device-storage.js';

export interface ReviewSessionProgress {
  nextCardIndex: number;
  /**
   * LB-B35 CP4: identity of the card to resume at. Optional so a record written by v1.2.1 (index only)
   * still loads, and so a v1.2.1 reader still accepts a record that carries it.
   */
  nextCardId?: string;
}

/**
 * Where to resume in a (possibly rebuilt) queue.
 *  - the saved card is still queued  -> its CURRENT position (the order may have changed)
 *  - the saved card is no longer queued (answered elsewhere, or no longer due) -> the start, so no unseen
 *    card is skipped
 *  - a legacy record with no card identity -> the saved index if it still exists (v1.2.1 behaviour), else
 *    the start
 */
export function resolveResumeIndex(
  saved: ReviewSessionProgress | null,
  queueCardIds: readonly string[],
): number | null {
  if (!saved || queueCardIds.length === 0) return null;
  if (saved.nextCardId !== undefined) {
    const at = queueCardIds.indexOf(saved.nextCardId);
    return at >= 0 ? at : null;
  }
  return saved.nextCardIndex < queueCardIds.length ? saved.nextCardIndex : null;
}

/** Stores only the next card index needed to resume a device-local review session. */
export function loadReviewSession(
  storage: DeviceStorage,
  key: string,
): ReviewSessionProgress | null {
  const raw = storage.getItem(key);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isReviewSessionProgress(parsed)) return clearReviewSession(storage, key);
    return parsed;
  } catch {
    return clearReviewSession(storage, key);
  }
}

export function saveReviewSession(
  storage: DeviceStorage,
  key: string,
  progress: ReviewSessionProgress,
): void {
  storage.setItem(key, JSON.stringify(progress));
}

export function clearReviewSession(storage: DeviceStorage, key: string): null {
  storage.removeItem(key);
  return null;
}

function isReviewSessionProgress(value: unknown): value is ReviewSessionProgress {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.nextCardIndex === 'number' &&
    Number.isSafeInteger(candidate.nextCardIndex) &&
    candidate.nextCardIndex >= 0 &&
    (candidate.nextCardId === undefined ||
      (typeof candidate.nextCardId === 'string' &&
        candidate.nextCardId.length > 0 &&
        candidate.nextCardId.length <= 200))
  );
}
