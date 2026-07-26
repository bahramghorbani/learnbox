import { describe, expect, it } from 'vitest';

import { decideNotification, type NotificationPreferences } from '../src/index.js';

const preferences: NotificationPreferences = {
  permissionGranted: true,
  enabledCategories: ['daily_review', 'weekly_report'],
  quietHours: { startsAtHour: 22, endsAtHour: 8 },
  maxPerDay: 1,
};

describe('notification policy', () => {
  it('never sends without an explicit opt-in', () => {
    expect(
      decideNotification(
        { ...preferences, permissionGranted: false },
        {
          category: 'daily_review',
          localHour: 10,
          sentToday: 0,
          consecutiveUnopened: 0,
        },
      ),
    ).toEqual({ shouldSend: false, reason: 'permission' });
  });

  it('respects quiet hours and the daily frequency cap', () => {
    expect(
      decideNotification(preferences, {
        category: 'daily_review',
        localHour: 23,
        sentToday: 0,
        consecutiveUnopened: 0,
      }),
    ).toEqual({ shouldSend: false, reason: 'quiet_hours' });
    expect(
      decideNotification(preferences, {
        category: 'daily_review',
        localHour: 10,
        sentToday: 1,
        consecutiveUnopened: 0,
      }),
    ).toEqual({ shouldSend: false, reason: 'frequency_cap' });
  });

  it('reduces reminders after repeated non-opens', () => {
    expect(
      decideNotification(preferences, {
        category: 'daily_review',
        localHour: 10,
        sentToday: 0,
        consecutiveUnopened: 3,
      }),
    ).toEqual({ shouldSend: false, reason: 'fatigue' });
  });

  it('allows an enabled, respectful reminder', () => {
    expect(
      decideNotification(preferences, {
        category: 'weekly_report',
        localHour: 10,
        sentToday: 0,
        consecutiveUnopened: 0,
      }),
    ).toEqual({ shouldSend: true });
  });
});
