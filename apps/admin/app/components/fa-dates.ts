/**
 * Persian date presentation, shared.
 *
 * Every Admin surface that shows a timestamp needs the same three answers — which day, which
 * moment, and how long ago — and three copies of a Jalali conversion is three places for a
 * calendar to drift. `Intl` does the conversion, so there is no date library in the bundle and no
 * hand-rolled Jalali arithmetic to get wrong on a leap year.
 *
 * Formatting is presentation only: canonical values stay ISO-8601 UTC strings everywhere else.
 * Days are rendered in `Asia/Tehran`, because "today" on an operator's dashboard means their day.
 */

const tehran = 'Asia/Tehran';

const dayFormat = new Intl.DateTimeFormat('fa-IR', {
  timeZone: tehran,
  day: 'numeric',
  month: 'long',
});

const dateTimeFormat = new Intl.DateTimeFormat('fa-IR', {
  timeZone: tehran,
  dateStyle: 'medium',
  timeStyle: 'short',
});

const dateFormat = new Intl.DateTimeFormat('fa-IR', {
  timeZone: tehran,
  dateStyle: 'medium',
});

function parse(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/** Day and month, e.g. «۱۵ مهر». Returns the input unchanged when it is not a date. */
export function faDay(value: string | null | undefined): string {
  const parsed = parse(value);
  return parsed ? dayFormat.format(parsed) : (value ?? '—');
}

/** Full moment, e.g. «۱۵ مهر ۱۴۰۵، ۱۴:۳۰». */
export function faDateTime(value: string | null | undefined): string {
  const parsed = parse(value);
  return parsed ? dateTimeFormat.format(parsed) : (value ?? '—');
}

/** Calendar day with its year, e.g. «۱۵ مهر ۱۴۰۵» — for rows where the clock time is noise. */
export function faDate(value: string | null | undefined): string {
  const parsed = parse(value);
  return parsed ? dateFormat.format(parsed) : (value ?? '—');
}

/**
 * How long ago, in the coarsest honest unit. An overview row says «۳ ساعت پیش» because that is
 * what the reader wants; the exact timestamp stays available as the element's `title`.
 */
export function faRelative(value: string | null | undefined, now: Date = new Date()): string {
  const parsed = parse(value);
  if (!parsed) return '—';
  const seconds = Math.round((now.getTime() - parsed.getTime()) / 1000);
  if (seconds < 0) return faDay(value);
  const relative = new Intl.RelativeTimeFormat('fa-IR', { numeric: 'auto' });
  if (seconds < 60) return 'همین حالا';
  if (seconds < 3600) return relative.format(-Math.floor(seconds / 60), 'minute');
  if (seconds < 86400) return relative.format(-Math.floor(seconds / 3600), 'hour');
  if (seconds < 86400 * 30) return relative.format(-Math.floor(seconds / 86400), 'day');
  return faDay(value);
}
