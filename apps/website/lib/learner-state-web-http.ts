import type { LearnerStateSnapshot } from '../../api/dist/learner-state/learner-state.service.js';

type BoundaryOptions = { development?: boolean };
type JsonObject = Record<string, unknown>;

export type WebLearnerStateDependencies = {
  readLearnerState(
    userId: string,
    options?: { requestedTimeZone?: string | null },
  ): Promise<LearnerStateSnapshot>;
};

const JSON_HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
};

/**
 * Web learner-state read (ADR 0012). Identity comes only from the signed HttpOnly
 * learner cookie (subject = canonical users.id); no Authorization header, no
 * client-supplied user ID, no mobile token. Reuses the API LearnerStateService
 * unchanged.
 */
export async function handleWebLearnerStateGet(
  request: Request,
  dependencies: WebLearnerStateDependencies,
  readSubject: (request: Request) => string | null,
  options: BoundaryOptions = {},
): Promise<Response> {
  if (
    request.method !== 'GET' ||
    !isSecure(request, options.development ?? process.env.NODE_ENV === 'development')
  )
    return error('validation', 400);

  const subject = readSubject(request);
  if (!subject) return error('invalidToken', 401);

  try {
    // The device zone is passed only when the client sent one. With no `tz` the call is exactly the
    // v1.2.1 call (userId only), so flag-off behaviour and the existing boundary contract are unchanged.
    const requestedTimeZone = new URL(request.url).searchParams.get('tz');
    const state = requestedTimeZone
      ? await dependencies.readLearnerState(subject, { requestedTimeZone })
      : await dependencies.readLearnerState(subject);
    return json(serialize(state), 200);
  } catch {
    return error('serverUnavailable', 503);
  }
}

function serialize(state: LearnerStateSnapshot): JsonObject {
  return {
    schedules: state.schedules.map((schedule) => ({
      cardId: schedule.cardId,
      contentId: schedule.contentId,
      state: schedule.state,
      stabilityDays: schedule.stabilityDays,
      difficulty: schedule.difficulty,
      lapses: schedule.lapses,
      dueAt: schedule.dueAt.toISOString(),
    })),
    newCards: state.newCards.map((card) => ({
      cardId: card.cardId,
      contentId: card.contentId,
      importance: card.importance,
    })),
    plan: {
      mode: state.plan.mode,
      reviewCardIds: state.plan.reviewCardIds,
      newCardIds: state.plan.newCardIds,
      message: state.plan.message,
    },
    reviewEventsCount: state.reviewEventsCount,
    reconciliationCursor: state.reconciliationCursor,
  };
}

function isSecure(request: Request, development: boolean): boolean {
  const url = new URL(request.url);
  return (
    url.protocol === 'https:' ||
    (development &&
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '::1'].includes(url.hostname))
  );
}

function error(
  code: 'validation' | 'invalidToken' | 'serverUnavailable',
  status: number,
): Response {
  return json({ error: code }, status);
}

function json(body: JsonObject, status: number): Response {
  return Response.json(body, { status, headers: JSON_HEADERS });
}
