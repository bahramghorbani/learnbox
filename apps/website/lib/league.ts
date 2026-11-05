/**
 * LearnBox League (لیگ لرن‌باکس): XP, levels, badges and the weekly group league.
 *
 * XP is never stored. It is derived on every read from server-owned history — accepted
 * review_events, learner_daily_plans and VERIFIED purchase_events — so the review and purchase
 * write paths stay untouched, a replayed request can never award twice, and a refunded or revoked
 * purchase stops counting the moment its status changes. The grade a learner gives never changes
 * XP, so nobody gains by answering dishonestly and the Leitner schedule stays trustworthy.
 *
 * Only two things are persisted (migration 0060): badges (awarded once, first time seen) and weekly
 * league membership (group, then final rank/outcome when the week is closed).
 */
import { learnedPredicateSql, masteredPredicateSql } from '@learnbox/learning-engine';
import type { Pool, PoolClient } from 'pg';

export const XP_RULES = {
  review: 10,
  newCard: 15,
  dailyPlan: 50,
  streakStep: 5,
  streakMax: 50,
  dailyReviewCap: 800,
  pack: 1_000,
  premiumPack: 2_500,
  premiumPackMinTomans: 100_000,
  badge: 100,
} as const;

/** Bonn (0) … Berlin (5). Persian labels live in the UI. */
export const LEAGUE_TIER_COUNT = 6;
export const LEAGUE_GROUP_SIZE = 30;
export const LEAGUE_ZONE = 'Asia/Tehran';
const DEFAULT_MIN_ACTIVE = 10;
const TOP_ROWS = 10;
const PERCENTILE_BUCKETS = [1, 5, 10, 25, 50] as const;

export const BADGE_IDS = [
  'streak_3',
  'streak_7',
  'streak_30',
  'streak_100',
  'words_50',
  'words_200',
  'words_500',
  'first_mastered',
  'collector',
  'league_promoted',
  'league_medal',
  'league_berlin',
  'dict_10',
  'dict_50',
  'dict_200',
] as const;
export type BadgeId = (typeof BADGE_IDS)[number];

// ---------------------------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------------------------

export function levelForXp(xp: number): { level: number; floorXp: number; nextXp: number } {
  const level = Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
  return { level, floorXp: (level - 1) ** 2 * 100, nextXp: level ** 2 * 100 };
}

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: LEAGUE_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
export const tehranDayKey = (at: Date): string => dayFormatter.format(at);

export function addDays(dayKey: string, days: number): string {
  const date = new Date(`${dayKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The Saturday that opens the league week containing `dayKey`. */
export function weekStartOf(dayKey: string): string {
  const dow = new Date(`${dayKey}T00:00:00Z`).getUTCDay(); // Saturday = 6
  return addDays(dayKey, -((dow + 1) % 7));
}

/** The instant the week opened by `weekStart` ends (next Saturday 00:00 Tehran; no DST since 2022). */
export function weekEndsAt(weekStart: string): Date {
  return new Date(Date.parse(`${addDays(weekStart, 7)}T00:00:00+03:30`));
}

export interface XpDay {
  day: string;
  reviews: number;
  newCards: number;
  planComplete: boolean;
}
export interface XpPurchase {
  at: Date;
  amountTomans: number | null;
}

export const purchaseXp = (amountTomans: number | null): number =>
  (amountTomans ?? 0) >= XP_RULES.premiumPackMinTomans ? XP_RULES.premiumPack : XP_RULES.pack;

export interface XpTotals {
  total: number;
  byWeek: Map<string, number>;
  byDay: Map<string, { reviewXp: number; streakXp: number; purchaseXp: number }>;
  longestStreak: number;
}

export function computeXp(
  days: readonly XpDay[],
  purchases: readonly XpPurchase[],
  badgeCount = 0,
): XpTotals {
  const byWeek = new Map<string, number>();
  const byDay: XpTotals['byDay'] = new Map();
  const add = (day: string, amount: number) => {
    const week = weekStartOf(day);
    byWeek.set(week, (byWeek.get(week) ?? 0) + amount);
  };
  let total = 0;
  let streak = 0;
  let longestStreak = 0;
  let previous: string | null = null;
  for (const d of [...days].filter((x) => x.reviews > 0).sort((a, b) => (a.day < b.day ? -1 : 1))) {
    streak = previous && addDays(previous, 1) === d.day ? streak + 1 : 1;
    longestStreak = Math.max(longestStreak, streak);
    previous = d.day;
    const raw =
      XP_RULES.review * (d.reviews - d.newCards) +
      XP_RULES.newCard * d.newCards +
      (d.planComplete ? XP_RULES.dailyPlan : 0);
    const reviewXp = Math.min(XP_RULES.dailyReviewCap, raw);
    const streakXp = Math.min(XP_RULES.streakMax, XP_RULES.streakStep * streak);
    byDay.set(d.day, { reviewXp, streakXp, purchaseXp: 0 });
    add(d.day, reviewXp + streakXp);
    total += reviewXp + streakXp;
  }
  for (const p of purchases) {
    const day = tehranDayKey(p.at);
    const xp = purchaseXp(p.amountTomans);
    const entry = byDay.get(day) ?? { reviewXp: 0, streakXp: 0, purchaseXp: 0 };
    byDay.set(day, { ...entry, purchaseXp: entry.purchaseXp + xp });
    add(day, xp);
    total += xp;
  }
  // Badge XP counts toward the lifetime total only, so backfilled badges cannot skew a league week.
  total += badgeCount * XP_RULES.badge;
  return { total, byWeek, byDay, longestStreak };
}

/** How many move up (and down) at week close. Never overlaps, small groups move nobody. */
export function promotionSlots(groupSize: number): number {
  return Math.min(groupSize >= 15 ? 5 : 3, Math.floor(groupSize / 3));
}

export function outcomeFor(
  rank: number,
  groupSize: number,
  tier: number,
): 'promoted' | 'stayed' | 'demoted' {
  const k = promotionSlots(groupSize);
  if (rank <= k && tier < LEAGUE_TIER_COUNT - 1) return 'promoted';
  if (rank > groupSize - k && tier > 0) return 'demoted';
  return 'stayed';
}

/** Tier for a new week from the learner's last closed membership; a skipped week costs one tier. */
export function nextTier(
  last: { weekStart: string; tier: number; outcome: string | null } | null,
  currentWeek: string,
): number {
  if (!last) return 0;
  let tier = last.tier + (last.outcome === 'promoted' ? 1 : last.outcome === 'demoted' ? -1 : 0);
  if (addDays(last.weekStart, 7) < currentWeek) tier -= 1;
  return Math.max(0, Math.min(LEAGUE_TIER_COUNT - 1, tier));
}

/** Coarse "top X%" so a rank never reveals how many learners exist. */
export function percentileBucket(rank: number, population: number): number | null {
  for (const bucket of PERCENTILE_BUCKETS) {
    if (rank <= Math.floor((population * bucket) / 100)) return bucket;
  }
  return null;
}

/** `LEARNBOX_LEAGUE_ENABLED` = `all`, or a comma list of learner ids (owner-first rollout). */
export function leagueEnabledFor(
  userId: string,
  value = process.env.LEARNBOX_LEAGUE_ENABLED,
): boolean {
  const setting = (value ?? '').trim();
  if (setting === 'all') return true;
  return setting
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(userId);
}

export function minActiveLearners(value = process.env.LEARNBOX_LEAGUE_MIN_ACTIVE): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : DEFAULT_MIN_ACTIVE;
}

export function earnedBadges(input: {
  longestStreak: number;
  learnedWords: number;
  masteredWords: number;
  verifiedPurchases: number;
  savedDictionaryWords: number;
  everPromoted: boolean;
  everMedal: boolean;
  reachedBerlin: boolean;
}): BadgeId[] {
  const earned: BadgeId[] = [];
  for (const n of [3, 7, 30, 100] as const)
    if (input.longestStreak >= n) earned.push(`streak_${n}`);
  for (const n of [50, 200, 500] as const) if (input.learnedWords >= n) earned.push(`words_${n}`);
  for (const n of [10, 50, 200] as const)
    if (input.savedDictionaryWords >= n) earned.push(`dict_${n}`);
  if (input.masteredWords > 0) earned.push('first_mastered');
  if (input.verifiedPurchases > 0) earned.push('collector');
  if (input.everPromoted) earned.push('league_promoted');
  if (input.everMedal) earned.push('league_medal');
  if (input.reachedBerlin) earned.push('league_berlin');
  return earned;
}

// ---------------------------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------------------------

type Queryable = Pick<Pool | PoolClient, 'query'>;

interface XpInputs {
  days: XpDay[];
  purchases: XpPurchase[];
}

/** XP inputs for every learner (`userId` null) or one learner. */
async function loadXpInputs(db: Queryable, userId: string | null): Promise<Map<string, XpInputs>> {
  // Sequential: `db` may be a single transaction client, which must not run queries concurrently.
  const dayRows = await db.query<{
    user_id: string;
    day: string;
    reviews: number;
    new_cards: number;
  }>(
    `WITH ev AS (
         SELECT user_id, (occurred_at AT TIME ZONE '${LEAGUE_ZONE}')::date AS day,
                row_number() OVER (PARTITION BY user_id, card_id ORDER BY occurred_at, id) = 1 AS first_seen
           FROM review_events
          WHERE ($1::uuid IS NULL OR user_id = $1::uuid)
       )
       SELECT user_id, day::text AS day, count(*)::int AS reviews,
              count(*) FILTER (WHERE first_seen)::int AS new_cards
         FROM ev GROUP BY user_id, day`,
    [userId],
  );
  // A plan is complete when every new card it planned was reviewed on that same local day.
  const planRows = await db.query<{ user_id: string; day: string }>(
    `SELECT p.user_id, p.local_day::text AS day
         FROM learner_daily_plans p
        WHERE ($1::uuid IS NULL OR p.user_id = $1::uuid)
          AND cardinality(p.new_card_ids) > 0
          AND NOT EXISTS (
            SELECT 1 FROM unnest(p.new_card_ids) AS planned(card_id)
             WHERE NOT EXISTS (
               SELECT 1 FROM review_events e
                WHERE e.user_id = p.user_id AND e.card_id = planned.card_id
                  AND (e.occurred_at AT TIME ZONE '${LEAGUE_ZONE}')::date = p.local_day))`,
    [userId],
  );
  const purchaseRows = await db.query<{ user_id: string; at: Date; amount_tomans: number | null }>(
    `SELECT user_id, COALESCE(verified_at, created_at) AS at, amount_tomans
         FROM purchase_events
        WHERE status = 'verified' AND ($1::uuid IS NULL OR user_id = $1::uuid)`,
    [userId],
  );
  const complete = new Set(planRows.rows.map((r) => `${r.user_id}|${r.day}`));
  const byUser = new Map<string, XpInputs>();
  const entry = (id: string) => {
    let value = byUser.get(id);
    if (!value) byUser.set(id, (value = { days: [], purchases: [] }));
    return value;
  };
  for (const r of dayRows.rows)
    entry(r.user_id).days.push({
      day: r.day,
      reviews: r.reviews,
      newCards: r.new_cards,
      planComplete: complete.has(`${r.user_id}|${r.day}`),
    });
  for (const r of purchaseRows.rows)
    entry(r.user_id).purchases.push({ at: new Date(r.at), amountTomans: r.amount_tomans });
  return byUser;
}

interface MemberRow {
  user_id: string;
  tier: number;
  group_no: number;
  joined_at: Date;
}

/**
 * Close every finished week and enrol this week's active learners. Runs under one advisory lock in
 * one transaction, so concurrent readers serialise and a re-run is a no-op. No scheduler needed:
 * the first read after Saturday 00:00 Tehran closes the previous week.
 */
async function syncLeague(
  client: PoolClient,
  now: Date,
): Promise<{ week: string; weekly: Map<string, number>; inputs: Map<string, XpInputs> }> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('learnbox_league'))`);
  const week = weekStartOf(tehranDayKey(now));
  // ponytail: whole-population XP derivation per read; materialise per-day XP when users reach ~10k.
  const inputs = await loadXpInputs(client, null);
  const weekXp = (userId: string, weekStart: string) => {
    const data = inputs.get(userId);
    return data ? (computeXp(data.days, data.purchases).byWeek.get(weekStart) ?? 0) : 0;
  };

  const open = await client.query<MemberRow & { week_start: string }>(
    `SELECT week_start::text, user_id, tier, group_no, joined_at FROM league_members
      WHERE closed_at IS NULL AND week_start < $1::date`,
    [week],
  );
  const groups = new Map<string, Array<MemberRow & { week_start: string; xp: number }>>();
  for (const row of open.rows) {
    const key = `${row.week_start}|${row.tier}|${row.group_no}`;
    groups.set(key, [
      ...(groups.get(key) ?? []),
      { ...row, xp: weekXp(row.user_id, row.week_start) },
    ]);
  }
  for (const members of groups.values()) {
    members.sort((a, b) => b.xp - a.xp || a.joined_at.getTime() - b.joined_at.getTime());
    for (const [index, m] of members.entries()) {
      await client.query(
        `UPDATE league_members SET weekly_xp = $3, final_rank = $4, outcome = $5, closed_at = now()
          WHERE week_start = $1::date AND user_id = $2 AND closed_at IS NULL`,
        [m.week_start, m.user_id, m.xp, index + 1, outcomeFor(index + 1, members.length, m.tier)],
      );
    }
  }

  const weekly = new Map<string, number>();
  for (const userId of inputs.keys()) {
    const xp = weekXp(userId, week);
    if (xp > 0) weekly.set(userId, xp);
  }
  const existing = await client.query<{ user_id: string }>(
    `SELECT user_id FROM league_members WHERE week_start = $1::date
     UNION SELECT user_id FROM league_opt_outs`,
    [week],
  );
  const skip = new Set(existing.rows.map((r) => r.user_id));
  const joining = [...weekly.keys()].filter((id) => !skip.has(id)).sort();
  if (joining.length > 0) {
    const last = await client.query<{
      user_id: string;
      week_start: string;
      tier: number;
      outcome: string | null;
    }>(
      `SELECT DISTINCT ON (user_id) user_id, week_start::text, tier, outcome FROM league_members
        WHERE user_id = ANY($1::uuid[]) AND week_start < $2::date
        ORDER BY user_id, week_start DESC`,
      [joining, week],
    );
    const lastByUser = new Map(last.rows.map((r) => [r.user_id, r]));
    const counts = await client.query<{ tier: number; group_no: number; n: number }>(
      `SELECT tier, group_no, count(*)::int AS n FROM league_members WHERE week_start = $1::date
        GROUP BY tier, group_no`,
      [week],
    );
    const fill = new Map<number, Map<number, number>>();
    for (const r of counts.rows) {
      if (!fill.has(r.tier)) fill.set(r.tier, new Map());
      fill.get(r.tier)!.set(r.group_no, r.n);
    }
    for (const userId of joining) {
      const prior = lastByUser.get(userId);
      const tier = nextTier(
        prior ? { weekStart: prior.week_start, tier: prior.tier, outcome: prior.outcome } : null,
        week,
      );
      const tierGroups = fill.get(tier) ?? new Map<number, number>();
      fill.set(tier, tierGroups);
      let group = 1;
      while ((tierGroups.get(group) ?? 0) >= LEAGUE_GROUP_SIZE) group += 1;
      tierGroups.set(group, (tierGroups.get(group) ?? 0) + 1);
      await client.query(
        `INSERT INTO league_members (week_start, user_id, tier, group_no) VALUES ($1::date, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [week, userId, tier, group],
      );
    }
  }
  return { week, weekly, inputs };
}

async function syncBadges(
  client: PoolClient,
  userId: string,
  longestStreak: number,
  purchases: number,
) {
  const facts = await client.query<{
    learned: number;
    mastered: number;
    saved_dictionary_words: number;
    promoted: boolean;
    medal: boolean;
    berlin: boolean;
  }>(
    `SELECT
       (SELECT count(*)::int FROM card_schedules WHERE user_id = $1 AND ${learnedPredicateSql('stability_days')}) AS learned,
       (SELECT count(*)::int FROM card_schedules WHERE user_id = $1 AND ${masteredPredicateSql('stability_days')}) AS mastered,
       (SELECT count(*)::int FROM dictionary_saved_words WHERE user_id = $1) AS saved_dictionary_words,
       EXISTS (SELECT 1 FROM league_members WHERE user_id = $1 AND outcome = 'promoted') AS promoted,
       EXISTS (SELECT 1 FROM league_members WHERE user_id = $1 AND final_rank <= 3) AS medal,
       EXISTS (SELECT 1 FROM league_members WHERE user_id = $1
                AND (tier = ${LEAGUE_TIER_COUNT - 1} OR (tier = ${LEAGUE_TIER_COUNT - 2} AND outcome = 'promoted'))) AS berlin`,
    [userId],
  );
  const f = facts.rows[0];
  const earned = earnedBadges({
    longestStreak,
    learnedWords: f.learned,
    masteredWords: f.mastered,
    verifiedPurchases: purchases,
    savedDictionaryWords: f.saved_dictionary_words,
    everPromoted: f.promoted,
    everMedal: f.medal,
    reachedBerlin: f.berlin,
  });
  if (earned.length > 0) {
    await client.query(
      `INSERT INTO user_badges (user_id, badge_id) SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`,
      [userId, earned],
    );
  }
  const all = await client.query<{ badge_id: string; awarded_at: Date }>(
    `SELECT badge_id, awarded_at FROM user_badges WHERE user_id = $1 ORDER BY awarded_at, badge_id`,
    [userId],
  );
  return all.rows.map((r) => ({ id: r.badge_id, awardedAt: new Date(r.awarded_at).toISOString() }));
}

export interface LeagueRow {
  rank: number;
  name: string;
  avatarId: string | null;
  xp: number;
  me: boolean;
  tier?: number;
}

export interface LeagueView {
  xp: {
    total: number;
    level: number;
    levelFloorXp: number;
    nextLevelXp: number;
    weekly: number;
    today: number;
    todayReviewXp: number;
    dailyReviewCap: number;
  };
  badges: Array<{ id: string; awardedAt: string }>;
  league: {
    state: 'live' | 'forming' | 'opted_out';
    weekStart: string;
    endsAt: string;
    tier: number;
    promotionSlots: number | null;
    me: { rank: number; gapToNext: number | null; zone: 'promotion' | 'demotion' | 'safe' } | null;
    group: LeagueRow[];
    global: { top: LeagueRow[]; percentile: number | null } | null;
  };
}

const displayName = (first: string | null) => first?.trim().split(/\s+/)[0] || 'یادگیرنده';

export async function readLeague(
  pool: Pool,
  userId: string,
  now = new Date(),
): Promise<LeagueView> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { week, weekly, inputs } = await syncLeague(client, now);
    const mine = inputs.get(userId) ?? { days: [], purchases: [] };
    const plain = computeXp(mine.days, mine.purchases);
    const badges = await syncBadges(client, userId, plain.longestStreak, mine.purchases.length);
    await client.query('COMMIT');

    const total = plain.total + badges.length * XP_RULES.badge;
    const today = plain.byDay.get(tehranDayKey(now));
    const level = levelForXp(total);

    const [optOut, membership, activeCount] = await Promise.all([
      pool.query('SELECT 1 FROM league_opt_outs WHERE user_id = $1', [userId]),
      pool.query<{ tier: number; group_no: number }>(
        'SELECT tier, group_no FROM league_members WHERE week_start = $1::date AND user_id = $2',
        [week, userId],
      ),
      pool.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM league_members WHERE week_start = $1::date',
        [week],
      ),
    ]);
    const optedOut = (optOut.rowCount ?? 0) > 0;
    const prior = await pool.query<{ week_start: string; tier: number; outcome: string | null }>(
      `SELECT week_start::text, tier, outcome FROM league_members WHERE user_id = $1 AND week_start < $2::date
        ORDER BY week_start DESC LIMIT 1`,
      [userId, week],
    );
    const tier =
      membership.rows[0]?.tier ??
      nextTier(
        prior.rows[0]
          ? {
              weekStart: prior.rows[0].week_start,
              tier: prior.rows[0].tier,
              outcome: prior.rows[0].outcome,
            }
          : null,
        week,
      );

    const base: LeagueView = {
      xp: {
        total,
        level: level.level,
        levelFloorXp: level.floorXp,
        nextLevelXp: level.nextXp,
        weekly: weekly.get(userId) ?? 0,
        today: today ? today.reviewXp + today.streakXp + today.purchaseXp : 0,
        todayReviewXp: today?.reviewXp ?? 0,
        dailyReviewCap: XP_RULES.dailyReviewCap,
      },
      badges,
      league: {
        state: optedOut ? 'opted_out' : 'forming',
        weekStart: week,
        endsAt: weekEndsAt(week).toISOString(),
        tier,
        promotionSlots: null,
        me: null,
        group: [],
        global: null,
      },
    };
    if (optedOut || activeCount.rows[0].n < minActiveLearners()) return base;

    const names = await pool.query<{
      id: string;
      first_name: string | null;
      avatar_id: string | null;
    }>(`SELECT id, first_name, avatar_id FROM users WHERE id = ANY($1::uuid[])`, [
      [...inputs.keys()],
    ]);
    const profile = new Map(names.rows.map((r) => [r.id, r]));
    const row = (
      id: string,
      rank: number,
      xp: number,
      extra: Partial<LeagueRow> = {},
    ): LeagueRow => ({
      rank,
      name: displayName(profile.get(id)?.first_name ?? null),
      avatarId: profile.get(id)?.avatar_id ?? null,
      xp,
      me: id === userId,
      ...extra,
    });

    const view: LeagueView = { ...base, league: { ...base.league, state: 'live' } };
    const group = membership.rows[0];
    if (group) {
      const members = await pool.query<{ user_id: string; joined_at: Date }>(
        `SELECT user_id, joined_at FROM league_members
          WHERE week_start = $1::date AND tier = $2 AND group_no = $3
            AND user_id NOT IN (SELECT user_id FROM league_opt_outs)`,
        [week, group.tier, group.group_no],
      );
      const ranked = members.rows
        .map((m) => ({
          id: m.user_id,
          joined: new Date(m.joined_at).getTime(),
          xp: weekly.get(m.user_id) ?? 0,
        }))
        .sort((a, b) => b.xp - a.xp || a.joined - b.joined);
      const k = promotionSlots(ranked.length);
      const myIndex = ranked.findIndex((m) => m.id === userId);
      view.league.promotionSlots = tier < LEAGUE_TIER_COUNT - 1 ? k : 0;
      view.league.group = ranked
        .map((m, i) => row(m.id, i + 1, m.xp))
        .filter((r) => r.rank <= TOP_ROWS || r.me);
      if (myIndex >= 0) {
        const rank = myIndex + 1;
        view.league.me = {
          rank,
          gapToNext: myIndex > 0 ? ranked[myIndex - 1].xp - ranked[myIndex].xp + 1 : null,
          zone:
            outcomeFor(rank, ranked.length, tier) === 'promoted'
              ? 'promotion'
              : outcomeFor(rank, ranked.length, tier) === 'demoted'
                ? 'demotion'
                : 'safe',
        };
      }
    }

    const optedOutIds = new Set(
      (await pool.query<{ user_id: string }>('SELECT user_id FROM league_opt_outs')).rows.map(
        (r) => r.user_id,
      ),
    );
    const badgeCounts = new Map(
      (
        await pool.query<{ user_id: string; n: number }>(
          'SELECT user_id, count(*)::int AS n FROM user_badges GROUP BY user_id',
        )
      ).rows.map((r) => [r.user_id, r.n]),
    );
    const tiers = new Map(
      (
        await pool.query<{ user_id: string; tier: number }>(
          `SELECT DISTINCT ON (user_id) user_id, tier FROM league_members ORDER BY user_id, week_start DESC`,
        )
      ).rows.map((r) => [r.user_id, r.tier]),
    );
    const totals = [...inputs.entries()]
      .filter(([id]) => !optedOutIds.has(id))
      .map(([id, data]) => ({
        id,
        xp: computeXp(data.days, data.purchases, badgeCounts.get(id) ?? 0).total,
      }))
      .filter((t) => t.xp > 0)
      .sort((a, b) => b.xp - a.xp || (a.id < b.id ? -1 : 1));
    const myGlobal = totals.findIndex((t) => t.id === userId);
    view.league.global = {
      top: totals
        .slice(0, TOP_ROWS)
        .map((t, i) => row(t.id, i + 1, t.xp, { tier: tiers.get(t.id) ?? 0 })),
      percentile: myGlobal >= 0 ? percentileBucket(myGlobal + 1, totals.length) : null,
    };
    return view;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Opting out removes the learner from this week's table at once; XP and badges are kept. */
export async function setLeagueOptOut(
  pool: Pool,
  userId: string,
  optOut: boolean,
  now = new Date(),
) {
  if (optOut) {
    await pool.query(
      `WITH o AS (INSERT INTO league_opt_outs (user_id) VALUES ($1) ON CONFLICT DO NOTHING)
       DELETE FROM league_members WHERE user_id = $1 AND week_start = $2::date AND closed_at IS NULL`,
      [userId, weekStartOf(tehranDayKey(now))],
    );
  } else {
    await pool.query('DELETE FROM league_opt_outs WHERE user_id = $1', [userId]);
  }
}
