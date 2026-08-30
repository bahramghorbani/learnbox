import type { LearnerStateSnapshot } from '../../api/dist/learner-state/learner-state.service.js';

export type WebLearnerStateResult =
  | { status: 'ok'; snapshot: LearnerStateSnapshot }
  | { status: 'unauthorized' }
  | { status: 'unavailable' };

const SCHEDULE_STATES = [
  'new',
  'learning',
  'review',
  'relearning',
  'mastered',
  'suspended',
  'archived',
] as const;
type ScheduleState = (typeof SCHEDULE_STATES)[number];

const PLAN_MODES = ['normal', 'recovery'] as const;
type PlanMode = (typeof PLAN_MODES)[number];

interface ParsedSchedule {
  cardId: string;
  contentId: string;
  state: ScheduleState;
  stabilityDays: number;
  difficulty: number;
  lapses: number;
  dueAt: string;
}

interface ParsedSnapshot {
  schedules: ParsedSchedule[];
  plan: {
    mode: PlanMode;
    reviewCardIds: string[];
    newCardIds: string[];
    message: string;
  };
  reviewEventsCount: number;
}

/**
 * Client-side read of the Web learner-state route. The route reads the signed
 * HttpOnly cookie itself; the client sends no Authorization header, user id,
 * phone or token. Only a parsed 200 response whose complete nested shape is
 * valid is treated as a server snapshot; every other outcome fails closed (no
 * server-backed claim).
 */
export async function fetchWebLearnerState(
  fetchFn: typeof fetch = fetch,
): Promise<WebLearnerStateResult> {
  let response: Response;
  try {
    response = await fetchFn('/api/learner/state', {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
  } catch {
    return { status: 'unavailable' };
  }
  if (response.status !== 200) {
    return response.status === 401 ? { status: 'unauthorized' } : { status: 'unavailable' };
  }
  try {
    const body = (await response.json()) as unknown;
    if (!isSnapshot(body)) return { status: 'unavailable' };
    return { status: 'ok', snapshot: normalizeSnapshot(body) };
  } catch {
    return { status: 'unavailable' };
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
}

function isValidIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

function isSchedule(value: unknown): value is ParsedSchedule {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    isNonEmptyString(candidate.cardId) &&
    isNonEmptyString(candidate.contentId) &&
    SCHEDULE_STATES.includes(candidate.state as ScheduleState) &&
    isNonNegativeFiniteNumber(candidate.stabilityDays) &&
    isFiniteNumber(candidate.difficulty) &&
    isNonNegativeFiniteNumber(candidate.lapses) &&
    isValidIsoDate(candidate.dueAt)
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isPlan(value: unknown): value is ParsedSnapshot['plan'] {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    PLAN_MODES.includes(candidate.mode as PlanMode) &&
    isStringArray(candidate.reviewCardIds) &&
    isStringArray(candidate.newCardIds) &&
    typeof candidate.message === 'string'
  );
}

function isSnapshot(body: unknown): body is ParsedSnapshot {
  if (typeof body !== 'object' || body === null) return false;
  const candidate = body as Record<string, unknown>;
  return (
    Array.isArray(candidate.schedules) &&
    candidate.schedules.every(isSchedule) &&
    isPlan(candidate.plan) &&
    isNonNegativeInteger(candidate.reviewEventsCount)
  );
}

function normalizeSnapshot(body: ParsedSnapshot): LearnerStateSnapshot {
  return {
    schedules: body.schedules.map((schedule) => ({
      ...schedule,
      dueAt: new Date(schedule.dueAt),
    })),
    plan: body.plan,
    reviewEventsCount: body.reviewEventsCount,
  };
}
