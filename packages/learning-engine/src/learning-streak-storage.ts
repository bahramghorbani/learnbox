import type { DeviceStorage } from './device-storage.js';

export interface LearningStreak {
  lastActiveDate: string;
  days: number;
}

/** Stores a calm, device-local daily streak without emitting analytics. */
export function loadLearningStreak(storage: DeviceStorage, key: string): LearningStreak | null {
  const raw = storage.getItem(key);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isLearningStreak(parsed)) return clearLearningStreak(storage, key);
    return parsed;
  } catch {
    return clearLearningStreak(storage, key);
  }
}

export function recordLearningStreak(
  storage: DeviceStorage,
  key: string,
  currentDateKey: string,
  previousDateKey: string,
): LearningStreak {
  const existing = loadLearningStreak(storage, key);
  const next: LearningStreak =
    existing?.lastActiveDate === currentDateKey
      ? existing
      : {
          lastActiveDate: currentDateKey,
          days: existing?.lastActiveDate === previousDateKey ? existing.days + 1 : 1,
        };
  storage.setItem(key, JSON.stringify(next));
  return next;
}

/** A previous-day streak remains encouraging; older activity becomes a fresh return. */
export function getCurrentStreakDays(
  streak: LearningStreak | null,
  currentDateKey: string,
  previousDateKey: string,
): number {
  if (!streak) return 0;
  return streak.lastActiveDate === currentDateKey || streak.lastActiveDate === previousDateKey
    ? streak.days
    : 0;
}

export function clearLearningStreak(storage: DeviceStorage, key: string): null {
  storage.removeItem(key);
  return null;
}

function isLearningStreak(value: unknown): value is LearningStreak {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.lastActiveDate === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(candidate.lastActiveDate) &&
    typeof candidate.days === 'number' &&
    Number.isSafeInteger(candidate.days) &&
    candidate.days > 0 &&
    candidate.days <= 3650
  );
}
