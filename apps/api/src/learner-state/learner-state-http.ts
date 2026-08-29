import type { LearnerStateSnapshot } from './learner-state.service.js';

type JsonObject = Record<string, unknown>;
type BoundaryOptions = { development?: boolean };

export type AccessVerification =
  { status: 'valid'; claims: { sub: string } } | { status: 'invalid' };

export type LearnerStateHttpDependencies = {
  verifyAccessToken(token: string): AccessVerification;
  readLearnerState(userId: string): Promise<LearnerStateSnapshot>;
};

const JSON_HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
};

/**
 * Server-authoritative learner state read (contract M1-D 12.3). Same trust
 * boundary as the review route: Bearer token only, HTTPS outside bounded
 * loopback, no cookies, no-store.
 */
export async function handleLearnerStateGet(
  request: Request,
  dependencies: LearnerStateHttpDependencies,
  options: BoundaryOptions = {},
): Promise<Response> {
  if (
    request.method !== 'GET' ||
    !isSecure(request, options.development ?? process.env.NODE_ENV === 'development')
  )
    return error('validation', 400);

  const authorization = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9._-]{1,2048})$/.exec(authorization);
  if (!match) return error('invalidToken', 401);
  const verification = dependencies.verifyAccessToken(match[1]);
  if (verification.status !== 'valid') return error('invalidToken', 401);

  try {
    const state = await dependencies.readLearnerState(verification.claims.sub);
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
    plan: {
      mode: state.plan.mode,
      reviewCardIds: state.plan.reviewCardIds,
      newCardIds: state.plan.newCardIds,
      message: state.plan.message,
    },
    reviewEventsCount: state.reviewEventsCount,
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
