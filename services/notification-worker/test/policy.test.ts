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

  it('never sends a category the learner did not enable', () => {
    expect(
      decideNotification(preferences, {
        category: 'achievement',
        localHour: 10,
        sentToday: 0,
        consecutiveUnopened: 0,
      }),
    ).toEqual({ shouldSend: false, reason: 'category' });
  });

  it('treats quiet hours that cross midnight correctly on both sides', () => {
    // After midnight (02:00) is still inside the 22:00–08:00 window.
    expect(
      decideNotification(preferences, {
        category: 'daily_review',
        localHour: 2,
        sentToday: 0,
        consecutiveUnopened: 0,
      }),
    ).toEqual({ shouldSend: false, reason: 'quiet_hours' });

    // Boundary: exactly 08:00 is outside the window.
    expect(
      decideNotification(preferences, {
        category: 'daily_review',
        localHour: 8,
        sentToday: 0,
        consecutiveUnopened: 0,
      }),
    ).toEqual({ shouldSend: true });
  });

  it('does not treat equal start/end quiet hours as a window', () => {
    expect(
      decideNotification(
        { ...preferences, quietHours: { startsAtHour: 8, endsAtHour: 8 } },
        { category: 'daily_review', localHour: 8, sentToday: 0, consecutiveUnopened: 0 },
      ),
    ).toEqual({ shouldSend: true });
  });

  it('applies no quiet-hour gate when quiet hours are unset', () => {
    expect(
      decideNotification(
        { ...preferences, quietHours: undefined },
        { category: 'daily_review', localHour: 23, sentToday: 0, consecutiveUnopened: 0 },
      ),
    ).toEqual({ shouldSend: true });
  });

  it('blocks at the exact fatigue threshold but not below it', () => {
    expect(
      decideNotification(preferences, {
        category: 'daily_review',
        localHour: 10,
        sentToday: 0,
        consecutiveUnopened: 2,
      }),
    ).toEqual({ shouldSend: true });
    expect(
      decideNotification(preferences, {
        category: 'daily_review',
        localHour: 10,
        sentToday: 0,
        consecutiveUnopened: 3,
      }),
    ).toEqual({ shouldSend: false, reason: 'fatigue' });
  });

  it('exempts subscription events from fatigue reduction', () => {
    expect(
      decideNotification(
        { ...preferences, enabledCategories: ['subscription_event'] },
        {
          category: 'subscription_event',
          localHour: 10,
          sentToday: 0,
          consecutiveUnopened: 5,
        },
      ),
    ).toEqual({ shouldSend: true });
  });
});
