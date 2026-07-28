import type { DeviceStorage } from './device-storage.js';

export interface ReviewSessionProgress {
  nextCardIndex: number;
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
    candidate.nextCardIndex >= 0
  );
}
