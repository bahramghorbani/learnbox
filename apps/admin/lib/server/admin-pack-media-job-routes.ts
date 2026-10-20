import { createHash, timingSafeEqual } from 'node:crypto';

import {
  assertTrustedAdminMutation,
  type AdminAuthConfig,
  type EnabledAdminAuthConfig,
} from './admin-auth-policy';
import { loadAdminSession, verifyAdminCsrf } from './admin-route-security';
import type { PackMediaJobService } from './pack-media-job-service';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const packIdPattern = /^[a-z0-9][a-z0-9-]{1,119}$/;
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

type RouteDependencies = {
  enabled: boolean;
  config: AdminAuthConfig;
  sessionStore?: Parameters<typeof loadAdminSession>[2];
  service?: PackMediaJobService;
  environment: Record<string, string | undefined>;
  now?: () => Date;
};

function notFound() {
  return new Response('Not found', { status: 404, headers });
}

function unauthorized() {
  return new Response('Unauthorized', { status: 401, headers });
}

function invalid() {
  return new Response('Invalid request', { status: 400, headers });
}

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, { ...init, headers: { ...headers, ...init?.headers } });
}

async function readJson(request: Request): Promise<Record<string, unknown> | undefined> {
  try {
    const body = await request.json();
    return typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

async function authorize(
  request: Request,
  dependencies: RouteDependencies,
  requireCsrf: boolean,
): Promise<{ actorUserId: string } | { response: Response }> {
  if (!dependencies.config.enabled || !dependencies.sessionStore) return { response: notFound() };
  const config = dependencies.config as EnabledAdminAuthConfig;
  if (requireCsrf) {
    try {
      assertTrustedAdminMutation(request, config, ['application/json']);
    } catch {
      return { response: invalid() };
    }
  }
  const session = await loadAdminSession(
    request,
    config,
    dependencies.sessionStore,
    (dependencies.now ?? (() => new Date()))(),
  );
  if (!session) return { response: unauthorized() };
  if (requireCsrf) {
    try {
      verifyAdminCsrf(request, session.csrfHash, config);
    } catch {
      return { response: invalid() };
    }
  }
  if (!session.operational || (requireCsrf && !session.recent))
    return { response: json({ code: 'reauthentication_required' }, { status: 428 }) };
  if (!dependencies.enabled || !dependencies.service) {
    return { response: json({ code: 'disabled' }, { status: 503 }) };
  }
  return { actorUserId: session.userId };
}

/** GET rehydrates the caller's last job; POST atomically snapshots a newly approved run. */
export function createPackMediaJobsRoute(dependencies: RouteDependencies) {
  return async function handler(request: Request): Promise<Response> {
    if (request.method === 'GET') {
      const authorized = await authorize(request, dependencies, false);
      if ('response' in authorized) return authorized.response;
      const packId = new URL(request.url).searchParams.get('packId');
      if (!packId || !packIdPattern.test(packId)) return invalid();
      const job = await dependencies.service!.latest(packId, authorized.actorUserId);
      return json({ job: job ?? null });
    }
    if (request.method !== 'POST')
      return new Response('Method not allowed', { status: 405, headers });
    const authorized = await authorize(request, dependencies, true);
    if ('response' in authorized) return authorized.response;
    const body = await readJson(request);
    const packId = typeof body?.packId === 'string' ? body.packId : undefined;
    if (!packId || !packIdPattern.test(packId)) return invalid();
    const runnerReady =
      dependencies.environment.LEARNBOX_PACK_MEDIA_RUNNER_ENABLED === 'true' &&
      (dependencies.environment.LEARNBOX_PACK_MEDIA_RUNNER_TOKEN ?? '').length >= 32;
    if (!runnerReady) return json({ code: 'runner_not_ready' }, { status: 503 });
    const result = await dependencies.service!.create(authorized.actorUserId, packId);
    if (result.status === 'forbidden') return json({ code: 'forbidden' }, { status: 403 });
    if (result.status === 'not_found') return json({ code: 'pack_not_found' }, { status: 404 });
    if (result.status === 'nothing_needed') return json({ status: 'nothing_needed' });
    if (result.status === 'needs_attention') return json({ code: result.reason }, { status: 409 });
    return json(
      { status: result.status, job: result.job },
      { status: result.status === 'created' ? 201 : 200 },
    );
  };
}

/** Stop is durable: it prevents the next dispatch but never cancels a provider call already sent. */
export function createPackMediaJobStopRoute(dependencies: RouteDependencies) {
  return async function POST(request: Request): Promise<Response> {
    const authorized = await authorize(request, dependencies, true);
    if ('response' in authorized) return authorized.response;
    const body = await readJson(request);
    const jobId = typeof body?.jobId === 'string' ? body.jobId : undefined;
    if (!jobId || !uuidPattern.test(jobId)) return invalid();
    const job = await dependencies.service!.stop(jobId, authorized.actorUserId);
    return job ? json({ job }) : notFound();
  };
}

export function createPackMediaJobResolveRoute(dependencies: RouteDependencies) {
  return async function POST(request: Request): Promise<Response> {
    const authorized = await authorize(request, dependencies, true);
    if ('response' in authorized) return authorized.response;
    const body = await readJson(request);
    const jobId = typeof body?.jobId === 'string' ? body.jobId : undefined;
    const itemId = typeof body?.itemId === 'string' ? body.itemId : undefined;
    const action = body?.action;
    const reason = typeof body?.reason === 'string' ? body.reason : undefined;
    if (
      !jobId ||
      !uuidPattern.test(jobId) ||
      !itemId ||
      !uuidPattern.test(itemId) ||
      (action !== 'defer' && action !== 'retry') ||
      !reason ||
      !reason.trim() ||
      reason.length > 1200
    )
      return invalid();
    const result = await dependencies.service!.resolve(
      jobId,
      itemId,
      authorized.actorUserId,
      action,
      reason,
      body?.confirmedPotentialDuplicateCharge === true,
    );
    if (result.status === 'forbidden') return json({ code: 'forbidden' }, { status: 403 });
    if (result.status === 'not_found') return notFound();
    if (result.status === 'invalid') return invalid();
    if (result.status === 'confirmation_required')
      return json({ code: 'confirmation_required' }, { status: 400 });
    if (result.status === 'conflict') return json({ code: 'state_conflict' }, { status: 409 });
    return json({ status: result.status, job: 'job' in result ? result.job : null });
  };
}

function tokenMatches(presented: string, expected: string): boolean {
  if (!presented || !expected) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(presented), digest(expected));
}

/** Machine-only runner. It is off by default and has no browser-cookie or CSRF surface. */
export function createPackMediaRunnerRoute(dependencies: RouteDependencies) {
  return async function POST(request: Request): Promise<Response> {
    const expected = dependencies.environment.LEARNBOX_PACK_MEDIA_RUNNER_TOKEN ?? '';
    if (
      dependencies.environment.LEARNBOX_PACK_MEDIA_RUNNER_ENABLED !== 'true' ||
      expected.length < 32
    ) {
      return notFound();
    }
    const presented = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1] ?? '';
    if (!tokenMatches(presented, expected)) return json({ error: 'unauthorized' }, { status: 401 });
    if (!dependencies.enabled || !dependencies.service)
      return json({ error: 'unavailable' }, { status: 503 });
    const result = await dependencies.service.runOne();
    return json(result);
  };
}
