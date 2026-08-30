import type { LearnerStateSnapshot } from '../../api/dist/learner-state/learner-state.service.js';

export type WebLearnerStateResult =
  | { status: 'ok'; snapshot: LearnerStateSnapshot }
  | { status: 'unauthorized' }
  | { status: 'unavailable' };

/**
 * Client-side read of the Web learner-state route. The route reads the signed
 * HttpOnly cookie itself; the client sends no Authorization header, user id,
 * phone or token. Only a parsed 200 response is treated as a server snapshot;
 * every other outcome fails closed (no server-backed claim).
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
    const body = (await response.json()) as LearnerStateSnapshot;
    if (!isSnapshot(body)) return { status: 'unavailable' };
    return { status: 'ok', snapshot: normalizeSnapshot(body) };
  } catch {
    return { status: 'unavailable' };
  }
}

function isSnapshot(body: unknown): body is LearnerStateSnapshot {
  if (typeof body !== 'object' || body === null) return false;
  const candidate = body as Record<string, unknown>;
  return (
    Array.isArray(candidate.schedules) &&
    typeof candidate.plan === 'object' &&
    candidate.plan !== null &&
    typeof candidate.reviewEventsCount === 'number'
  );
}

function normalizeSnapshot(body: LearnerStateSnapshot): LearnerStateSnapshot {
  return {
    schedules: body.schedules.map((schedule) => ({
      ...schedule,
      dueAt: new Date(schedule.dueAt),
    })),
    plan: body.plan,
    reviewEventsCount: body.reviewEventsCount,
  };
}
