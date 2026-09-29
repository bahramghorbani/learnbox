/**
 * Client side of the server-authoritative learner summary (LB-B25, CP-3).
 *
 * Invariant: for a signed-in learner the SERVER is the origin of today's count and
 * the streak. The device copy written here is a cache for offline display only and
 * is consulted solely when the server cannot be reached. It is never read while a
 * server answer is available, so it can never override or "win" against the
 * database — which is what let a re-login or a fresh device show different numbers.
 */

export interface LearnerSummaryView {
  reviewedToday: number;
  streakDays: number;
  longestStreakDays: number;
  activeDays: number;
  totalReviews: number;
}

export type SummaryFetchResult =
  | { status: 'ok'; summary: LearnerSummaryView }
  | { status: 'unauthorized' }
  | { status: 'unavailable' };

export interface SummaryCacheStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const nonNegativeInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function parseLearnerSummary(value: unknown): LearnerSummaryView | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (
    !nonNegativeInt(v.reviewedToday) ||
    !nonNegativeInt(v.streakDays) ||
    !nonNegativeInt(v.longestStreakDays) ||
    !nonNegativeInt(v.activeDays) ||
    !nonNegativeInt(v.totalReviews)
  ) {
    return null;
  }
  return {
    reviewedToday: v.reviewedToday,
    streakDays: v.streakDays,
    longestStreakDays: v.longestStreakDays,
    activeDays: v.activeDays,
    totalReviews: v.totalReviews,
  };
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export async function fetchLearnerSummary(
  fetchImpl: typeof fetch = fetch,
  timeZone: string = browserTimeZone(),
): Promise<SummaryFetchResult> {
  try {
    const response = await fetchImpl(`/api/learner/summary?tz=${encodeURIComponent(timeZone)}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (response.status === 401) return { status: 'unauthorized' };
    if (!response.ok) return { status: 'unavailable' };
    const summary = parseLearnerSummary(await response.json());
    return summary ? { status: 'ok', summary } : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

interface CachedSummary {
  summary: LearnerSummaryView;
  /** Learner-local day the cache was written; "today" is only valid for that day. */
  dateKey: string;
  streakDateKey: string;
}

export function saveSummaryCache(
  store: SummaryCacheStore,
  key: string,
  summary: LearnerSummaryView,
  dateKey: string,
): void {
  try {
    const entry: CachedSummary = { summary, dateKey, streakDateKey: dateKey };
    store.setItem(key, JSON.stringify(entry));
  } catch {
    // Cache only: failing to write it must never affect the learner.
  }
}

/**
 * Offline fallback. Today's count is dropped when the cache is from another day,
 * and a streak last confirmed before yesterday can no longer be claimed.
 */
export function loadSummaryCache(
  store: SummaryCacheStore,
  key: string,
  currentDateKey: string,
  previousDateKey: string,
): LearnerSummaryView | null {
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedSummary>;
    const summary = parseLearnerSummary(parsed.summary);
    if (!summary || typeof parsed.dateKey !== 'string') return null;
    const sameDay = parsed.dateKey === currentDateKey;
    const streakAlive = sameDay || parsed.dateKey === previousDateKey;
    return {
      ...summary,
      reviewedToday: sameDay ? summary.reviewedToday : 0,
      streakDays: streakAlive ? summary.streakDays : 0,
    };
  } catch {
    return null;
  }
}
