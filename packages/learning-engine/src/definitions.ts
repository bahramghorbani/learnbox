/**
 * Canonical learning-domain definitions (LB-B35 CP2).
 *
 * This file is the ONLY place that may define what a Box, "Learned", "Mastered", a binary response,
 * Accuracy or a local learning day is. Learner app, API, database projections and Admin must call
 * these helpers (or the SQL fragments generated from the same constants) instead of re-deriving the
 * rules. It is pure: no I/O, no DOM, no Node-only API, no dependency on any other module, so any
 * workspace (including Admin) can import it.
 *
 * It deliberately contains NO scheduling policy. Scheduler v2 (owner decision D1–D4) is a later
 * checkpoint. Nothing here reads `difficulty`, `lapses` or lateness, and nothing here writes history:
 * `review_events` stays append-only and is only ever *projected* through these functions.
 */

// ---------------------------------------------------------------------------------------------
// Review grades and the canonical binary response
// ---------------------------------------------------------------------------------------------

/** Historical four-grade vocabulary. Stays valid forever: it is what `review_events.grade` stores. */
export const REVIEW_GRADES = ['forgot', 'hard', 'remembered', 'mastered'] as const;
export type ReviewGrade = (typeof REVIEW_GRADES)[number];

/** The learner-facing answer: «بلد بودم» = known, «بلد نیستم» = unknown. */
export const BINARY_RESPONSES = ['known', 'unknown'] as const;
export type BinaryResponse = (typeof BINARY_RESPONSES)[number];

/**
 * Historical grade projection (owner decision, 2026-10-01). Total over `ReviewGrade`, so adding a
 * grade without classifying it is a compile error.
 */
export const HISTORICAL_GRADE_PROJECTION: Readonly<Record<ReviewGrade, BinaryResponse>> =
  Object.freeze({
    forgot: 'unknown',
    hard: 'known',
    remembered: 'known',
    mastered: 'known',
  });

export function isReviewGrade(value: unknown): value is ReviewGrade {
  return typeof value === 'string' && (REVIEW_GRADES as readonly string[]).includes(value);
}

export function isBinaryResponse(value: unknown): value is BinaryResponse {
  return typeof value === 'string' && (BINARY_RESPONSES as readonly string[]).includes(value);
}

/**
 * Project any stored or incoming answer to the canonical binary response. Accepts both the
 * historical grades and the binary values so that history written before and after the binary UI
 * can be read through one function. Throws on anything else: an unrecognised answer must never be
 * silently counted as known or unknown.
 */
export function toBinaryResponse(answer: string): BinaryResponse {
  if (isBinaryResponse(answer)) return answer;
  if (isReviewGrade(answer)) return HISTORICAL_GRADE_PROJECTION[answer];
  throw new RangeError(`Unrecognised review answer: ${JSON.stringify(answer)}`);
}

/** Every stored answer value that projects to `response` (used to build SQL predicates). */
export function answersProjectingTo(response: BinaryResponse): readonly string[] {
  return [
    ...REVIEW_GRADES.filter((grade) => HISTORICAL_GRADE_PROJECTION[grade] === response),
    response,
  ];
}

// ---------------------------------------------------------------------------------------------
// Box 1–5, Learned, Mastered
// ---------------------------------------------------------------------------------------------

export const BOX_COUNT = 5;
export type Box = 1 | 2 | 3 | 4 | 5;
export const BOXES: readonly Box[] = Object.freeze([1, 2, 3, 4, 5] as const);

/**
 * Inclusive lower bound of each Box, in days of stored `stability_days`. Box n covers
 * `[BOX_LOWER_BOUND_DAYS[n-1], BOX_LOWER_BOUND_DAYS[n])`; Box 5 is unbounded above. These are the
 * thresholds the shipped Today/Words/Progress code already used (`<1, <3, <7, <21, >=21`), so
 * adopting this function moves no existing card.
 */
export const BOX_LOWER_BOUND_DAYS: readonly [0, 1, 3, 7, 21] = Object.freeze([
  0, 1, 3, 7, 21,
] as const);

/** A card is in Box n iff its stored stability_days falls in Box n's interval. Pure and total. */
export function boxFromStabilityDays(stabilityDays: number): Box {
  if (Number.isNaN(stabilityDays)) {
    throw new RangeError('stability_days is NaN; a Box cannot be derived');
  }
  for (let box = BOX_COUNT; box >= 2; box -= 1) {
    if (stabilityDays >= BOX_LOWER_BOUND_DAYS[box - 1]!) return box as Box;
  }
  return 1;
}

/** Canonical rules, owner decision 2026-10-01: Learned = Box 4 or higher, Mastered = Box 5. */
export const LEARNED_MIN_BOX: Box = 4;
export const MASTERED_MIN_BOX: Box = 5;
export const LEARNED_MIN_STABILITY_DAYS = BOX_LOWER_BOUND_DAYS[LEARNED_MIN_BOX - 1]!;
export const MASTERED_MIN_STABILITY_DAYS = BOX_LOWER_BOUND_DAYS[MASTERED_MIN_BOX - 1]!;

export const isLearnedBox = (box: Box): boolean => box >= LEARNED_MIN_BOX;
export const isMasteredBox = (box: Box): boolean => box >= MASTERED_MIN_BOX;

/**
 * NOTE: `card_schedules.state = 'mastered'` is NOT the definition of Mastered and must not be read as
 * one. Mastered is a pure function of Box (stability). The `state` column stays as legacy telemetry.
 */
export const isLearnedStability = (stabilityDays: number): boolean =>
  isLearnedBox(boxFromStabilityDays(stabilityDays));
export const isMasteredStability = (stabilityDays: number): boolean =>
  isMasteredBox(boxFromStabilityDays(stabilityDays));

export type BoxCounts = readonly [number, number, number, number, number];

/** Count cards per Box from their stored stability values. Cards never started are not counted. */
export function countBoxes(stabilityDays: Iterable<number>): BoxCounts {
  const counts: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const value of stabilityDays) counts[boxFromStabilityDays(value) - 1]! += 1;
  return counts;
}

export interface BoxSummary {
  /** Cards that have a schedule row (started). */
  started: number;
  learned: number;
  mastered: number;
  boxes: BoxCounts;
}

export function summarizeBoxCounts(boxes: BoxCounts): BoxSummary {
  return {
    started: boxes.reduce((sum, n) => sum + n, 0),
    learned: boxes.slice(LEARNED_MIN_BOX - 1).reduce((sum, n) => sum + n, 0),
    mastered: boxes.slice(MASTERED_MIN_BOX - 1).reduce((sum, n) => sum + n, 0),
    boxes,
  };
}

// ---------------------------------------------------------------------------------------------
// Accuracy
// ---------------------------------------------------------------------------------------------

export interface AnswerCounts {
  known: number;
  unknown: number;
}

export interface Accuracy extends AnswerCounts {
  total: number;
  /** known / total in [0,1]; null when there is no answer (never 0, which would read as "all wrong"). */
  ratio: number | null;
  /** Rounded whole percent (half up); null when there is no answer. */
  percent: number | null;
}

/**
 * Canonical Accuracy = known answers / all answers, over the same set of answers. Each answer counts
 * once (not per card). Historical `hard`, `remembered` and `mastered` are known; `forgot` is unknown.
 * Counting is done in the database (see {@link accuracyCountsSql}); the ratio is derived ONLY here.
 */
export function computeAccuracy(counts: AnswerCounts): Accuracy {
  const { known, unknown } = counts;
  for (const value of [known, unknown]) {
    if (!Number.isInteger(value) || value < 0) {
      throw new RangeError('Answer counts must be non-negative integers');
    }
  }
  const total = known + unknown;
  if (total === 0) return { known, unknown, total, ratio: null, percent: null };
  return {
    known,
    unknown,
    total,
    ratio: known / total,
    percent: Math.round((known / total) * 100),
  };
}

export function accuracyFromAnswers(answers: Iterable<string>): Accuracy {
  const counts = { known: 0, unknown: 0 };
  for (const answer of answers) counts[toBinaryResponse(answer)] += 1;
  return computeAccuracy(counts);
}

// ---------------------------------------------------------------------------------------------
// Local learning day, streak
// ---------------------------------------------------------------------------------------------

/**
 * A "learning day" is the calendar day in the LEARNER's IANA time zone, never the server's and never
 * UTC. The zone is supplied per request (there is no stored per-user zone yet); an unknown or
 * missing zone, or one that is not an IANA name (including a fixed UTC offset), degrades to UTC
 * rather than failing.
 */
export function normalizeTimeZone(candidate: string | null | undefined): string {
  if (!candidate || candidate.length > 64) return 'UTC';
  // IANA names only (`Asia/Tehran`, `UTC`, `Etc/GMT+3`): they start with a letter. Fixed-offset
  // strings (`+03:30`, `-0500`) are refused on purpose. Modern runtimes accept them in `Intl`, but
  // Postgres reads the same text as a POSIX zone with the OPPOSITE sign, so TypeScript and SQL
  // would put the same review on different local days. (LB-B35 CP3; owner decision O2.)
  if (!IANA_SHAPE.test(candidate)) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate });
    return candidate;
  } catch {
    return 'UTC';
  }
}
const IANA_SHAPE = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/;

// ---------------------------------------------------------------------------------------------
// Session capacity and the daily new-card allowance (LB-B35 CP4)
// ---------------------------------------------------------------------------------------------

/**
 * The 5-minute session holds at most this many cards IN TOTAL: due reviews plus new cards. It is the
 * product's existing capacity (v1.2.1) and is NOT "12 due + 3 new". Changing it is a product decision.
 */
export const SESSION_CAPACITY_CARDS = 12;

/**
 * At most this many NEW cards are introduced per learner-local day, however many times the plan is
 * read, however many sessions are started and from whichever device. New cards only fill spare
 * session capacity, so one session never holds more than SESSION_CAPACITY_CARDS in total.
 */
export const DAILY_NEW_CARD_ALLOWANCE = 3;

/**
 * Which zone a learner's local day is computed in (owner decision O2, LB-B35 CP4).
 *
 * Order: the zone stored on the account, then the zone the device reports, then UTC. Each candidate
 * must be a valid IANA name; an invalid stored value is skipped, never trusted. `persist` is the one
 * place that says whether the device zone should be written back: only when the account has NO valid
 * stored zone yet and the device reports a valid, non-UTC-by-default one. After that only an explicit
 * profile change updates it, so an ordinary request from a traveller never moves the learner's day.
 * Changing the zone changes how days are bucketed, never any stored timestamp.
 */
export function resolveLearnerTimeZone(
  stored: string | null | undefined,
  requested: string | null | undefined,
): { timeZone: string; source: 'stored' | 'request' | 'default'; persist: string | null } {
  const isValid = (zone: string | null | undefined): zone is string =>
    !!zone && normalizeTimeZone(zone) === zone;
  if (isValid(stored)) return { timeZone: stored, source: 'stored', persist: null };
  if (isValid(requested)) return { timeZone: requested, source: 'request', persist: requested };
  return { timeZone: 'UTC', source: 'default', persist: null };
}

/** `YYYY-MM-DD` of `instant` in `timeZone`. Equals Postgres `(ts AT TIME ZONE tz)::date`. */
export function localDayKey(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: normalizeTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const pick = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${pick('year').padStart(4, '0')}-${pick('month')}-${pick('day')}`;
}

const DAY_MS = 86_400_000;
const dayKeyToEpochDay = (key: string): number => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) throw new RangeError(`Invalid day key: ${key}`);
  return Math.round(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS);
};
const epochDayToKey = (epochDay: number): string =>
  new Date(epochDay * DAY_MS).toISOString().slice(0, 10);

export const addDaysToDayKey = (key: string, days: number): string =>
  epochDayToKey(dayKeyToEpochDay(key) + days);

export interface StreakSummary {
  /** Consecutive active days ending today or yesterday; 0 if the last active day is older. */
  current: number;
  longest: number;
  activeDays: number;
}

/**
 * Streak over local day keys that each contain at least one review. A run that ended YESTERDAY still
 * counts (the learner has until the end of today to continue it). This is the exact rule the
 * server-authoritative summary SQL (LB-B11) implements; a DB-backed test holds the two equal on every
 * history EXCEPT one pinned defect: the shipped SQL drops the whole run if a clock-skewed review lands on a
 * local day after today (canonical ignores such future days). Fixing the SQL is CP3.
 */
export function computeStreak(activeDayKeys: Iterable<string>, today: string): StreakSummary {
  const todayDay = dayKeyToEpochDay(today);
  // Days after "today" (possible only via accepted clock skew) are not learning days yet: ignore them.
  const days = [...new Set(activeDayKeys)]
    .map(dayKeyToEpochDay)
    .filter((day) => day <= todayDay)
    .sort((a, b) => a - b);
  let longest = 0;
  let current = 0;
  let runLength = 0;
  let previous: number | null = null;
  for (const day of days) {
    runLength = previous !== null && day === previous + 1 ? runLength + 1 : 1;
    longest = Math.max(longest, runLength);
    if (day >= todayDay - 1 && day <= todayDay) current = runLength;
    previous = day;
  }
  return { current, longest, activeDays: days.length };
}

// ---------------------------------------------------------------------------------------------
// SQL projections generated from the same constants (so SQL cannot drift from TypeScript)
// ---------------------------------------------------------------------------------------------

const SQL_COLUMN = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/i;
function sqlColumn(column: string): string {
  if (!SQL_COLUMN.test(column)) throw new RangeError(`Unsafe SQL column reference: ${column}`);
  return column;
}
const sqlNumber = (value: number): string => {
  if (!Number.isFinite(value)) throw new RangeError('SQL thresholds must be finite');
  return String(value);
};
const sqlStringList = (values: readonly string[]): string =>
  values.map((value) => `'${value.replace(/'/g, "''")}'`).join(', ');

/** `CASE … END` yielding the Box (1–5) of a `stability_days` column. */
export function boxCaseSql(stabilityColumn: string): string {
  const column = sqlColumn(stabilityColumn);
  const arms = [5, 4, 3, 2]
    .map((box) => `WHEN ${column} >= ${sqlNumber(BOX_LOWER_BOUND_DAYS[box - 1]!)} THEN ${box}`)
    .join(' ');
  return `CASE ${arms} ELSE 1 END`;
}

/** Boolean predicate: the card is Learned (Box 4+). */
export const learnedPredicateSql = (stabilityColumn: string): string =>
  `${sqlColumn(stabilityColumn)} >= ${sqlNumber(LEARNED_MIN_STABILITY_DAYS)}`;

/** Boolean predicate: the card is Mastered (Box 5). */
export const masteredPredicateSql = (stabilityColumn: string): string =>
  `${sqlColumn(stabilityColumn)} >= ${sqlNumber(MASTERED_MIN_STABILITY_DAYS)}`;

/** `SELECT`-list fragment: `known` and `unknown` answer counts from a grade column. */
export function accuracyCountsSql(gradeColumn: string): string {
  const column = sqlColumn(gradeColumn);
  return [
    `count(*) FILTER (WHERE ${column} IN (${sqlStringList(answersProjectingTo('known'))})) AS known`,
    `count(*) FILTER (WHERE ${column} IN (${sqlStringList(answersProjectingTo('unknown'))})) AS unknown`,
  ].join(', ');
}
