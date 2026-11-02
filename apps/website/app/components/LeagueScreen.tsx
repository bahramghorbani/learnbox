'use client';

import Image from 'next/image';
import { useState } from 'react';

import { AVATARS } from '../../lib/learner-profile-fields';
import {
  BADGE_ORDER,
  BADGES,
  BadgeMedal,
  LEAGUE_TIERS,
  RankMedal,
  TierCrest,
  tierName,
} from './LeagueArt';
import { LearnerNav, type LearnerDestination } from './LearnerNav';

export interface LeagueRowView {
  rank: number;
  name: string;
  avatarId: string | null;
  xp: number;
  me: boolean;
  tier?: number;
}

export interface LeagueData {
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
    group: LeagueRowView[];
    global: { top: LeagueRowView[]; percentile: number | null } | null;
  };
}

/** Defensive parse: anything unexpected means "no league", never a broken screen. */
export function parseLeague(value: unknown): LeagueData | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<LeagueData> & { enabled?: unknown };
  if (v.enabled !== true || !v.xp || !v.league || !Array.isArray(v.badges)) return null;
  if (typeof v.xp.total !== 'number' || typeof v.league.tier !== 'number') return null;
  if (!Array.isArray(v.league.group)) return null;
  return v as LeagueData;
}

export const fa = (n: number) => n.toLocaleString('fa-IR');

function remaining(endsAt: string, now = Date.now()) {
  const ms = Math.max(0, Date.parse(endsAt) - now);
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  return days > 0 ? `${fa(days)} روز و ${fa(hours)} ساعت` : `${fa(hours)} ساعت`;
}

function Avatar({ id }: { id: string | null }) {
  const avatar = AVATARS.find((a) => a.id === id) ?? AVATARS[0];
  return (
    <span className="league-row-avatar" aria-hidden="true">
      <Image src={avatar.src} alt="" width={26} height={31} />
    </span>
  );
}

function Row({ row, zone }: { row: LeagueRowView; zone?: 'up' | 'down' | null }) {
  const medal = row.rank <= 3 ? (row.rank as 1 | 2 | 3) : null;
  return (
    <li
      className={[
        'league-row',
        medal ? `league-row-medal league-row-${medal}` : row.rank <= 10 ? 'league-row-top' : '',
        row.me ? 'league-row-me' : '',
        zone === 'up' ? 'league-row-up' : zone === 'down' ? 'league-row-down' : '',
      ].join(' ')}
      aria-current={row.me ? 'true' : undefined}
    >
      <span className="league-row-rank">{medal ? <RankMedal rank={medal} /> : fa(row.rank)}</span>
      <Avatar id={row.avatarId} />
      <span className="league-row-name">
        {row.name}
        {row.me ? <small> (شما)</small> : null}
        {row.tier !== undefined ? (
          <small className="league-row-tier"> · {tierName(row.tier)}</small>
        ) : null}
      </span>
      <span className="league-row-xp">
        {fa(row.xp)} <small>امتیاز</small>
      </span>
    </li>
  );
}

export function LeagueScreen({
  data,
  loading,
  onRetry,
  onNavigate,
}: {
  data: LeagueData | null;
  loading: boolean;
  onRetry: () => void;
  onNavigate: (destination: LearnerDestination) => void;
}) {
  const [tab, setTab] = useState<'week' | 'all'>('week');
  const tier = data?.league.tier ?? 0;
  const t = LEAGUE_TIERS[tier];
  const slots = data?.league.promotionSlots ?? 0;
  const size = data?.league.group.length ?? 0;

  return (
    <main className="app-shell league-shell" data-testid="learnbox-league">
      <header
        className="league-hero"
        style={{ background: `linear-gradient(150deg, ${t.from} -30%, #6d28d9 45%, #2e1065 110%)` }}
      >
        <div className="league-hero-sparkles" aria-hidden="true" />
        <div className="league-hero-top">
          <TierCrest tier={tier} size={62} />
          <div className="league-hero-title">
            <small>لیگ لرن‌باکس</small>
            <h1>لیگ {tierName(tier)}</h1>
            {data ? (
              <span className="league-hero-ends">پایان هفته: {remaining(data.league.endsAt)}</span>
            ) : null}
          </div>
          <div className="league-hero-xp">
            <small>این هفته</small>
            <b>{fa(data?.xp.weekly ?? 0)}</b>
            <small>امتیاز</small>
          </div>
        </div>
        <ol className="league-path" aria-label="مسیر لیگ">
          {LEAGUE_TIERS.map((item, index) => (
            <li
              key={item.name}
              className={index === tier ? 'is-current' : index < tier ? 'is-done' : ''}
            >
              <span style={{ background: index <= tier ? item.from : undefined }} />
              {item.name}
            </li>
          ))}
        </ol>
        {data?.league.state === 'live' ? (
          <div className="league-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === 'week'}
              onClick={() => setTab('week')}
              type="button"
            >
              لیگ هفتگی
            </button>
            <button
              role="tab"
              aria-selected={tab === 'all'}
              onClick={() => setTab('all')}
              type="button"
            >
              کل لرن‌باکس
            </button>
          </div>
        ) : null}
      </header>

      <section className="league-body" aria-live="polite">
        {!data ? (
          <div className="league-empty">
            <Image src="/images/bobo/recovery-v2.png" alt="" width={110} height={130} />
            <p>{loading ? 'در حال آماده کردن جدول لیگ…' : 'الان به جدول لیگ دسترسی نداریم.'}</p>
            {!loading ? (
              <button className="league-retry" type="button" onClick={onRetry}>
                تلاش دوباره
              </button>
            ) : null}
          </div>
        ) : data.league.state !== 'live' ? (
          <div className="league-empty">
            <Image src="/images/bobo/focus-v2.png" alt="" width={120} height={142} />
            {data.league.state === 'opted_out' ? (
              <>
                <h2>نمایش شما در لیگ خاموش است</h2>
                <p>امتیازها و بج‌هایت محفوظ است. از پروفایل می‌توانی دوباره به لیگ برگردی.</p>
              </>
            ) : (
              <>
                <h2>لیگ این هفته در حال شکل‌گیری است</h2>
                <p>امتیازهایت ذخیره می‌شود. وقتی گروه کامل شد، جدول رتبه‌ها نمایش داده می‌شود.</p>
              </>
            )}
          </div>
        ) : tab === 'week' ? (
          <>
            {data.league.me ? (
              <div className={`league-me league-me-${data.league.me.zone}`}>
                <div>
                  <small>رتبهٔ شما در گروه</small>
                  <b>{fa(data.league.me.rank)}</b>
                </div>
                <p>
                  {data.league.me.zone === 'promotion'
                    ? `در منطقهٔ صعود به ${tierName(tier + 1)} هستی!`
                    : data.league.me.zone === 'demotion'
                      ? 'در منطقهٔ سقوطی؛ چند مرور دیگر نجاتت می‌دهد.'
                      : 'در منطقهٔ امن هستی.'}
                  {data.league.me.gapToNext ? (
                    <span> {fa(data.league.me.gapToNext)} امتیاز تا رتبهٔ بالاتر.</span>
                  ) : null}
                </p>
              </div>
            ) : null}
            <ol className="league-table">
              {data.league.group.map((row) => {
                const zone =
                  slots > 0 && row.rank <= slots
                    ? 'up'
                    : tier > 0 && slots > 0 && row.rank > size - slots
                      ? 'down'
                      : null;
                return <Row key={`${row.rank}-${row.name}`} row={row} zone={zone} />;
              })}
            </ol>
            {slots > 0 ? (
              <p className="league-legend">
                <span className="league-legend-up">▲ {fa(slots)} نفر اول صعود می‌کنند</span>
                {tier > 0 ? (
                  <span className="league-legend-down">▼ {fa(slots)} نفر آخر سقوط می‌کنند</span>
                ) : null}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <div className="league-percentile">
              <small>جایگاه شما بین همهٔ یادگیرنده‌های لرن‌باکس</small>
              <b>
                {data.league.global?.percentile
                  ? `جزو ${fa(data.league.global.percentile)}٪ برتر`
                  : 'به‌زودی در جمع برترها'}
              </b>
              <span>امتیاز کل: {fa(data.xp.total)}</span>
            </div>
            <h2 className="league-subtitle">۱۰ نفر اول لرن‌باکس</h2>
            <ol className="league-table">
              {(data.league.global?.top ?? []).map((row) => (
                <Row key={`g-${row.rank}`} row={row} />
              ))}
            </ol>
          </>
        )}
      </section>
      <LearnerNav current="league" onNavigate={onNavigate} />
    </main>
  );
}

/** XP, level and badge cabinet for the Profile screen. */
export function LeagueProfileCard({
  data,
  onToggleOptOut,
  busy,
}: {
  data: LeagueData;
  onToggleOptOut: (optOut: boolean) => void;
  busy: boolean;
}) {
  const earned = new Set(data.badges.map((b) => b.id));
  const span = Math.max(1, data.xp.nextLevelXp - data.xp.levelFloorXp);
  const pct = Math.min(100, Math.round(((data.xp.total - data.xp.levelFloorXp) / span) * 100));
  const [open, setOpen] = useState<string | null>(null);
  const optedOut = data.league.state === 'opted_out';
  return (
    <section className="league-profile" aria-label="امتیاز و بج‌ها">
      <div className="league-level">
        <div className="league-level-ring" style={{ ['--pct' as string]: `${pct}%` }}>
          <span>
            <small>سطح</small>
            <b>{fa(data.xp.level)}</b>
          </span>
        </div>
        <div className="league-level-info">
          <b>{fa(data.xp.total)} امتیاز</b>
          <span>
            {fa(Math.max(0, data.xp.nextLevelXp - data.xp.total))} امتیاز تا سطح{' '}
            {fa(data.xp.level + 1)}
          </span>
          <span className="league-level-tier">
            <TierCrest tier={data.league.tier} size={20} /> لیگ {tierName(data.league.tier)}
          </span>
        </div>
      </div>
      <h3>
        بج‌ها{' '}
        <small>
          {fa(earned.size)} از {fa(BADGE_ORDER.length)}
        </small>
      </h3>
      <ul className="league-badges">
        {BADGE_ORDER.map((id) => (
          <li key={id}>
            <button
              type="button"
              className="league-badge"
              aria-expanded={open === id}
              onClick={() => setOpen(open === id ? null : id)}
            >
              <BadgeMedal id={id} earned={earned.has(id)} size={70} />
              <span>{BADGES[id].title}</span>
            </button>
          </li>
        ))}
      </ul>
      {open ? (
        <p className="league-badge-hint" role="status">
          {earned.has(open) ? '✓ ' : '🔒 '}
          {BADGES[open].title}: {BADGES[open].hint}
        </p>
      ) : null}
      <label className="league-optout">
        <span>
          نمایش من در لیگ
          <small>با خاموش کردن، نامت در جدول‌ها دیده نمی‌شود.</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={!optedOut}
          disabled={busy}
          onChange={(event) => onToggleOptOut(!event.target.checked)}
        />
      </label>
    </section>
  );
}

/** Small "this week" chip under the Today header. */
export function LeagueTodayChip({ data, onOpen }: { data: LeagueData; onOpen: () => void }) {
  return (
    <button type="button" className="league-chip" onClick={onOpen}>
      <TierCrest tier={data.league.tier} size={26} />
      <span>
        <b>لیگ {tierName(data.league.tier)}</b>
        <small>
          امروز {fa(data.xp.today)} · این هفته {fa(data.xp.weekly)} امتیاز
        </small>
      </span>
      {data.league.me ? <em>رتبهٔ {fa(data.league.me.rank)}</em> : <em>لیدربورد ←</em>}
    </button>
  );
}
