import { describe, expect, it } from 'vitest';

import {
  createMemoryStorage,
  loadDailyReviewProgress,
  saveDailyReviewProgress,
} from '../src/index.js';

describe('daily review storage', () => {
  it('restores only today’s device-local review count', () => {
    const storage = createMemoryStorage();
    saveDailyReviewProgress(storage, 'daily-review', {
      dateKey: '2026-07-28',
      reviewedCount: 3,
    });

    expect(loadDailyReviewProgress(storage, 'daily-review', '2026-07-28')).toEqual({
      dateKey: '2026-07-28',
      reviewedCount: 3,
    });
  });

  it('clears stale or malformed data instead of carrying it into a new day', () => {
    const storage = createMemoryStorage();
    saveDailyReviewProgress(storage, 'daily-review', {
      dateKey: '2026-07-27',
      reviewedCount: 3,
    });
    expect(loadDailyReviewProgress(storage, 'daily-review', '2026-07-28')).toBeNull();
    expect(storage.getItem('daily-review')).toBeNull();

    storage.setItem('daily-review', JSON.stringify({ dateKey: '2026-07-28', reviewedCount: -1 }));
    expect(loadDailyReviewProgress(storage, 'daily-review', '2026-07-28')).toBeNull();
    expect(storage.getItem('daily-review')).toBeNull();
  });
});
