import { describe, expect, it } from 'vitest';

import {
  XP_RULES,
  computeXp,
  earnedBadges,
  leagueEnabledFor,
  levelForXp,
  minActiveLearners,
  nextTier,
  outcomeFor,
  percentileBucket,
  promotionSlots,
  tehranDayKey,
  weekEndsAt,
  weekStartOf,
} from '../lib/league';

describe('league rules (pure)', () => {
  it('levels follow floor(sqrt(xp/100)) + 1', () => {
    expect(levelForXp(0)).toEqual({ level: 1, floorXp: 0, nextXp: 100 });
    expect(levelForXp(1_600).level).toBe(5);
    expect(levelForXp(8_100).level).toBe(10);
    expect(levelForXp(8_099).level).toBe(9);
  });

  it('weeks open on Saturday 00:00 Tehran', () => {
    expect(weekStartOf('2026-11-02')).toBe('2026-10-31'); // Monday → Saturday
    expect(weekStartOf('2026-10-31')).toBe('2026-10-31'); // Saturday itself
    expect(weekStartOf('2026-11-06')).toBe('2026-10-31'); // Friday
    expect(weekStartOf('2026-11-07')).toBe('2026-11-07');
    // Friday 20:29 UTC is Friday 23:59 in Tehran; 20:30 UTC is Saturday 00:00.
    expect(tehranDayKey(new Date('2026-11-06T20:29:00Z'))).toBe('2026-11-06');
    expect(tehranDayKey(new Date('2026-11-06T20:30:00Z'))).toBe('2026-11-07');
    expect(weekEndsAt('2026-10-31').toISOString()).toBe('2026-11-06T20:30:00.000Z');
  });

  it('XP ignores grades, caps review XP per day, and rewards streaks up to 50', () => {
    const xp = computeXp(
      [
        { day: '2026-11-01', reviews: 12, newCards: 1, planComplete: true },
        { day: '2026-11-02', reviews: 200, newCards: 0, planComplete: true },
        { day: '2026-11-04', reviews: 1, newCards: 0, planComplete: false },
      ],
      [],
    );
    const d1 = 11 * 10 + 15 + 50;
    expect(xp.byDay.get('2026-11-01')).toEqual({ reviewXp: d1, streakXp: 5, purchaseXp: 0 });
    expect(xp.byDay.get('2026-11-02')).toEqual({
      reviewXp: XP_RULES.dailyReviewCap,
      streakXp: 10,
      purchaseXp: 0,
    });
    expect(xp.byDay.get('2026-11-04')?.streakXp).toBe(5); // streak broken on 11-03
    expect(xp.total).toBe(d1 + 5 + 800 + 10 + 10 + 5);
    expect(xp.longestStreak).toBe(2);

    const long = computeXp(
      Array.from({ length: 15 }, (_, i) => ({
        day: `2026-10-${String(i + 1).padStart(2, '0')}`,
        reviews: 1,
        newCards: 0,
        planComplete: false,
      })),
      [],
    );
    expect(long.byDay.get('2026-10-15')?.streakXp).toBe(50);
  });

  it('purchases give 1,000 or 2,500 outside the daily cap; badges count only lifetime', () => {
    const xp = computeXp(
      [],
      [
        { at: new Date('2026-11-01T08:00:00Z'), amountTomans: 49_000 },
        { at: new Date('2026-11-01T09:00:00Z'), amountTomans: 240_000 },
      ],
      2,
    );
    expect(xp.total).toBe(1_000 + 2_500 + 200);
    expect(xp.byWeek.get('2026-10-31')).toBe(3_500);
  });

  it('promotion and demotion never overlap and small groups move fewer', () => {
    expect(promotionSlots(30)).toBe(5);
    expect(promotionSlots(15)).toBe(5);
    expect(promotionSlots(14)).toBe(3);
    expect(promotionSlots(6)).toBe(2);
    expect(promotionSlots(2)).toBe(0);
    expect(outcomeFor(1, 30, 0)).toBe('promoted');
    expect(outcomeFor(30, 30, 0)).toBe('stayed'); // nobody falls out of Bonn
    expect(outcomeFor(30, 30, 2)).toBe('demoted');
    expect(outcomeFor(1, 30, 5)).toBe('stayed'); // Berlin is the top
  });

  it('a skipped week costs one tier, never below Bonn', () => {
    expect(nextTier(null, '2026-10-31')).toBe(0);
    expect(nextTier({ weekStart: '2026-10-24', tier: 2, outcome: 'promoted' }, '2026-10-31')).toBe(
      3,
    );
    expect(nextTier({ weekStart: '2026-10-17', tier: 2, outcome: 'stayed' }, '2026-10-31')).toBe(1);
    expect(nextTier({ weekStart: '2026-10-17', tier: 0, outcome: 'demoted' }, '2026-10-31')).toBe(
      0,
    );
  });

  it('percentiles are coarse buckets that never reveal the population', () => {
    expect(percentileBucket(1, 7)).toBe(25); // tiny populations never claim "top 1%"
    expect(percentileBucket(1, 12)).toBe(10);
    expect(percentileBucket(3, 100)).toBe(5);
    expect(percentileBucket(60, 100)).toBeNull();
  });

  it('the flag supports "all" and an owner-first id list; anything else is off', () => {
    expect(leagueEnabledFor('u1', undefined)).toBe(false);
    expect(leagueEnabledFor('u1', 'true')).toBe(false);
    expect(leagueEnabledFor('u1', 'all')).toBe(true);
    expect(leagueEnabledFor('u1', ' u0 , u1 ')).toBe(true);
    expect(minActiveLearners(undefined)).toBe(10);
    expect(minActiveLearners('3')).toBe(3);
    expect(minActiveLearners('-1')).toBe(10);
  });

  it('badges follow the twelve approved milestones', () => {
    expect(
      earnedBadges({
        longestStreak: 8,
        learnedWords: 210,
        masteredWords: 1,
        verifiedPurchases: 1,
        savedDictionaryWords: 0,
        everPromoted: true,
        everMedal: false,
        reachedBerlin: false,
      }),
    ).toEqual([
      'streak_3',
      'streak_7',
      'words_50',
      'words_200',
      'first_mastered',
      'collector',
      'league_promoted',
    ]);
  });

  it('dictionary saves earn their own milestone badges', () => {
    expect(
      earnedBadges({
        longestStreak: 0,
        learnedWords: 0,
        masteredWords: 0,
        verifiedPurchases: 0,
        savedDictionaryWords: 50,
        everPromoted: false,
        everMedal: false,
        reachedBerlin: false,
      }),
    ).toEqual(['dict_10', 'dict_50']);
  });
});
