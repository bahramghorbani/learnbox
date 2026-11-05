/**
 * League art: badge medallions and city crests, drawn as inline SVG in the LearnBox palette
 * (violet #6d28d9, apricot #f97316, gold, Bobo lavender). No new raster assets, so nothing new to
 * cache, sign or ship to the stores.
 */
import Image from 'next/image';

export const LEAGUE_TIERS = [
  { name: 'بن', from: '#2dd4bf', to: '#0f766e', glow: '#99f6e4' },
  { name: 'درسدن', from: '#60a5fa', to: '#1d4ed8', glow: '#bfdbfe' },
  { name: 'کلن', from: '#fb923c', to: '#c2410c', glow: '#fed7aa' },
  { name: 'هامبورگ', from: '#38bdf8', to: '#1e3a8a', glow: '#bae6fd' },
  { name: 'مونیخ', from: '#facc15', to: '#b45309', glow: '#fef08a' },
  { name: 'برلین', from: '#a78bfa', to: '#4c1d95', glow: '#ddd6fe' },
] as const;

export const tierName = (tier: number) => LEAGUE_TIERS[Math.max(0, Math.min(5, tier))].name;

type Family = 'streak' | 'words' | 'league' | 'shop';

export const BADGES: Record<
  string,
  { title: string; hint: string; family: Family; ribbon: string; bobo: string }
> = {
  streak_3: {
    title: 'شعلهٔ اول',
    hint: '۳ روز پشت‌سرهم',
    family: 'streak',
    ribbon: '۳ روز',
    bobo: 'encourage',
  },
  streak_7: {
    title: 'یک هفتهٔ داغ',
    hint: '۷ روز پشت‌سرهم',
    family: 'streak',
    ribbon: '۷ روز',
    bobo: 'encourage',
  },
  streak_30: {
    title: 'آتش ماندگار',
    hint: '۳۰ روز پشت‌سرهم',
    family: 'streak',
    ribbon: '۳۰ روز',
    bobo: 'celebrate',
  },
  streak_100: {
    title: 'افسانهٔ پیوستگی',
    hint: '۱۰۰ روز پشت‌سرهم',
    family: 'streak',
    ribbon: '۱۰۰ روز',
    bobo: 'celebrate',
  },
  words_50: {
    title: 'واژه‌چین',
    hint: '۵۰ واژهٔ یادگرفته',
    family: 'words',
    ribbon: '۵۰ واژه',
    bobo: 'focus',
  },
  words_200: {
    title: 'کتاب‌خوان',
    hint: '۲۰۰ واژهٔ یادگرفته',
    family: 'words',
    ribbon: '۲۰۰ واژه',
    bobo: 'focus',
  },
  words_500: {
    title: 'واژه‌دان',
    hint: '۵۰۰ واژهٔ یادگرفته',
    family: 'words',
    ribbon: '۵۰۰ واژه',
    bobo: 'celebrate',
  },
  first_mastered: {
    title: 'استاد',
    hint: 'اولین واژه در جعبهٔ ۵',
    family: 'words',
    ribbon: 'جعبهٔ ۵',
    bobo: 'welcome',
  },
  dict_10: {
    title: 'جست‌وجوگر',
    hint: '۱۰ واژه در دیکشنری ذخیره شد',
    family: 'words',
    ribbon: '۱۰ واژه',
    bobo: 'encourage',
  },
  dict_50: {
    title: 'واژه‌ساز',
    hint: '۵۰ واژه در دیکشنری ذخیره شد',
    family: 'words',
    ribbon: '۵۰ واژه',
    bobo: 'focus',
  },
  dict_200: {
    title: 'دانشنامه',
    hint: '۲۰۰ واژه در دیکشنری ذخیره شد',
    family: 'words',
    ribbon: '۲۰۰ واژه',
    bobo: 'celebrate',
  },
  collector: {
    title: 'کلکسیونر',
    hint: 'خرید اولین پک',
    family: 'shop',
    ribbon: 'پک',
    bobo: 'celebrate',
  },
  league_promoted: {
    title: 'اولین صعود',
    hint: 'صعود در لیگ هفتگی',
    family: 'league',
    ribbon: 'صعود',
    bobo: 'encourage',
  },
  league_medal: {
    title: 'سکوی افتخار',
    hint: 'پایان هفته بین ۳ نفر اول',
    family: 'league',
    ribbon: 'مدال',
    bobo: 'celebrate',
  },
  league_berlin: {
    title: 'فاتح برلین',
    hint: 'رسیدن به لیگ برلین',
    family: 'league',
    ribbon: 'برلین',
    bobo: 'welcome',
  },
};
export const BADGE_ORDER = Object.keys(BADGES);

const FAMILY: Record<Family, { a: string; b: string; ring: string; ribbon: string }> = {
  streak: { a: '#fdba74', b: '#ea580c', ring: '#fff7ed', ribbon: '#c2410c' },
  words: { a: '#c4b5fd', b: '#6d28d9', ring: '#f5f3ff', ribbon: '#4c1d95' },
  league: { a: '#fde68a', b: '#d97706', ring: '#fffbeb', ribbon: '#92400e' },
  shop: { a: '#f9a8d4', b: '#db2777', ring: '#fdf2f8', ribbon: '#9d174d' },
};

/** A scalloped medallion with Bobo in the centre and a ribbon carrying the milestone. */
export function BadgeMedal({
  id,
  earned,
  size = 84,
}: {
  id: string;
  earned: boolean;
  size?: number;
}) {
  const badge = BADGES[id];
  if (!badge) return null;
  const c = FAMILY[badge.family];
  const gid = `bm-${id}`;
  const points = Array.from({ length: 24 }, (_, i) => {
    const r = i % 2 === 0 ? 46 : 41;
    const angle = (Math.PI * 2 * i) / 24 - Math.PI / 2;
    return `${50 + r * Math.cos(angle)},${48 + r * Math.sin(angle)}`;
  }).join(' ');
  return (
    <div
      className={`league-medal ${earned ? 'is-earned' : 'is-locked'}`}
      style={{ width: size, height: size * 1.12 }}
    >
      <svg viewBox="0 0 100 112" aria-hidden="true">
        <defs>
          <linearGradient id={`${gid}-g`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={c.a} />
            <stop offset="1" stopColor={c.b} />
          </linearGradient>
          <radialGradient id={`${gid}-s`} cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
            <stop offset="1" stopColor={c.ring} />
          </radialGradient>
        </defs>
        <polygon points={points} fill={`url(#${gid}-g)`} />
        <circle cx="50" cy="48" r="34" fill={`url(#${gid}-s)`} stroke="#fff" strokeWidth="2.5" />
        <path
          d="M24 30 A34 34 0 0 1 60 15"
          stroke="#fff"
          strokeOpacity=".7"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        <path d="M18 88 L82 88 L76 98 L82 108 L18 108 L24 98 Z" fill={c.ribbon} />
        <path d="M22 84 H78 V102 H22 Z" fill={`url(#${gid}-g)`} />
        <text x="50" y="97.5" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#fff">
          {badge.ribbon}
        </text>
      </svg>
      <Image
        className="league-medal-bobo"
        src={`/images/bobo/${badge.bobo}-v2.png`}
        alt=""
        width={44}
        height={52}
      />
      {!earned && (
        <span className="league-medal-lock" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M17 9V7a5 5 0 0 0-10 0v2H5v13h14V9h-2Zm-8-2a3 3 0 0 1 6 0v2H9V7Z" />
          </svg>
        </span>
      )}
    </div>
  );
}

/** City crest: a shield in the tier colours, a skyline, and one star per tier climbed. */
export function TierCrest({ tier, size = 64 }: { tier: number; size?: number }) {
  const t = LEAGUE_TIERS[Math.max(0, Math.min(5, tier))];
  const gid = `crest-${tier}`;
  return (
    <svg
      className="league-crest"
      viewBox="0 0 80 92"
      width={size}
      height={size * 1.15}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={t.from} />
          <stop offset="1" stopColor={t.to} />
        </linearGradient>
      </defs>
      <path
        d="M40 4 L74 14 V44 C74 66 58 80 40 88 C22 80 6 66 6 44 V14 Z"
        fill={`url(#${gid})`}
        stroke="#fff"
        strokeWidth="3"
      />
      <path
        d="M14 18 L40 10 L52 13.5"
        stroke="#fff"
        strokeOpacity=".55"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M16 62 V50 h6 v-6 h4 v6 h4 V38 l5-6 5 6 v24 h4 V46 h4 v-4 h4 v4 h4 v16 Z"
        fill="#fff"
        fillOpacity=".9"
      />
      {Array.from({ length: tier + 1 }, (_, i) => {
        const x = 40 + (i - tier / 2) * 9;
        return (
          <path
            key={i}
            transform={`translate(${x - 4} 22) scale(.34)`}
            d="M12 0l3.7 7.6 8.3 1.2-6 5.9 1.4 8.3L12 19l-7.4 4 1.4-8.3-6-5.9 8.3-1.2z"
            fill={t.glow}
          />
        );
      })}
      <path d="M30 70 Q40 75 50 70" stroke="#fff" strokeOpacity=".6" strokeWidth="2" fill="none" />
    </svg>
  );
}

export function RankMedal({ rank }: { rank: 1 | 2 | 3 }) {
  const c = { 1: ['#fde68a', '#d97706'], 2: ['#f1f5f9', '#94a3b8'], 3: ['#fed7aa', '#b45309'] }[
    rank
  ];
  return (
    <svg viewBox="0 0 32 40" width="28" height="35" aria-label={`رتبهٔ ${rank}`} role="img">
      <path
        d="M8 0h7l3 12h-7zM24 0h-7l-3 12h7z"
        fill={rank === 1 ? '#7c3aed' : rank === 2 ? '#3b82f6' : '#f97316'}
      />
      <circle cx="16" cy="25" r="13" fill={c[1]} />
      <circle cx="16" cy="25" r="10" fill={c[0]} />
      <text x="16" y="29.5" textAnchor="middle" fontSize="12" fontWeight="800" fill={c[1]}>
        {rank.toLocaleString('fa-IR')}
      </text>
    </svg>
  );
}
