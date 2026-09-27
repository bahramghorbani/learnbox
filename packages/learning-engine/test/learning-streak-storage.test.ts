import { describe, expect, it } from 'vitest';

import {
  createMemoryStorage,
  getCurrentStreakDays,
  loadLearningStreak,
  recordLearningStreak,
} from '../src/index.js';

describe('learning streak storage', () => {
  it('counts one activity per day and extends only from the previous day', () => {
    const storage = createMemoryStorage();
    expect(recordLearningStreak(storage, 'streak', '2026-07-27', '2026-07-26')).toEqual({
      lastActiveDate: '2026-07-27',
      days: 1,
    });
    expect(recordLearningStreak(storage, 'streak', '2026-07-27', '2026-07-26').days).toBe(1);
    expect(recordLearningStreak(storage, 'streak', '2026-07-28', '2026-07-27')).toEqual({
      lastActiveDate: '2026-07-28',
      days: 2,
    });
  });

  it('welcomes a return with a fresh count and ignores malformed saved data', () => {
    const storage = createMemoryStorage();
    storage.setItem('streak', JSON.stringify({ lastActiveDate: '2026-07-20', days: 4 }));
    expect(
      getCurrentStreakDays(loadLearningStreak(storage, 'streak'), '2026-07-28', '2026-07-27'),
    ).toBe(0);
    expect(recordLearningStreak(storage, 'streak', '2026-07-28', '2026-07-27')).toEqual({
      lastActiveDate: '2026-07-28',
      days: 1,
    });

    storage.setItem('streak', JSON.stringify({ lastActiveDate: 'bad', days: -1 }));
    expect(loadLearningStreak(storage, 'streak')).toBeNull();
    expect(storage.getItem('streak')).toBeNull();
  });
});
