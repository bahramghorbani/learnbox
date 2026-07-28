import type { DeviceStorage } from './device-storage.js';

export interface DailyReviewProgress {
  dateKey: string;
  reviewedCount: number;
}

/** Reads only the current device-local day's review count. */
export function loadDailyReviewProgress(
  storage: DeviceStorage,
  key: string,
  currentDateKey: string,
): DailyReviewProgress | null {
  const raw = storage.getItem(key);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isDailyReviewProgress(parsed) || parsed.dateKey !== currentDateKey) {
      return clearDailyReviewProgress(storage, key);
    }
    return parsed;
  } catch {
    return clearDailyReviewProgress(storage, key);
  }
}

export function saveDailyReviewProgress(
  storage: DeviceStorage,
  key: string,
  progress: DailyReviewProgress,
): void {
  storage.setItem(key, JSON.stringify(progress));
}

export function clearDailyReviewProgress(storage: DeviceStorage, key: string): null {
  storage.removeItem(key);
  return null;
}

function isDailyReviewProgress(value: unknown): value is DailyReviewProgress {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.dateKey === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(candidate.dateKey) &&
    typeof candidate.reviewedCount === 'number' &&
    Number.isSafeInteger(candidate.reviewedCount) &&
    candidate.reviewedCount > 0 &&
    candidate.reviewedCount <= 500
  );
}
