import {
  assertTrustedAdminMutation,
  type AdminAuthConfig,
  type EnabledAdminAuthConfig,
} from './admin-auth-policy';
import { loadAdminSession, verifyAdminCsrf } from './admin-route-security';
import {
  type ArchivePackResult,
  type PackLifecycleMutation,
  type PostgresContentLifecycleStore,
  type PublishPackResult,
  type SubmitForReviewResult,
} from './postgres-content-lifecycle-store';
import { isPackLifecycleStatus } from '@learnbox/content-models';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** `packs.id` is a canonical text slug, not a uuid. Mirrors the content-packs routes. */
const packIdPattern = /^[a-z0-9][a-z0-9-]{1,119}$/;

type LifecycleDependencies<TMethod extends keyof PostgresContentLifecycleStore> = {
  enabled: boolean;
  config: AdminAuthConfig;
  sessionStore?: Parameters<typeof loadAdminSession>[2];
  store?: Pick<PostgresContentLifecycleStore, TMethod>;
  now?: () => Date;
};

function notFound() {
  return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

function unauthorized() {
  return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });
}

function genericInvalid() {
  return new Response('Invalid request', { status: 400, headers: { 'Cache-Control': 'no-store' } });
}

function unavailable() {
  return new Response('Content lifecycle unavailable', {
    status: 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: { 'Cache-Control': 'no-store', ...init?.headers },
  });
}

function readIdempotencyKey(request: Request): string | undefined {
  const value = request.headers.get('idempotency-key');
  if (!value || !uuidPattern.test(value)) return undefined;
  return value;
}

function parseJsonBody(request: Request): Promise<Record<string, unknown> | undefined> {
  return request
    .json()
    .then((value) =>
      value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined,
    )
    .catch(() => undefined);
}

type ParsedMutation = Omit<PackLifecycleMutation, 'actorUserId' | 'idempotencyKey'>;

function parseMutationBody(body: Record<string, unknown>): ParsedMutation | undefined {
  const { packId, expectedStatus } = body;
  if (typeof packId !== 'string' || !packIdPattern.test(packId)) return undefined;
  if (expectedStatus !== undefined && !isPackLifecycleStatus(expectedStatus)) return undefined;
  return { packId, expectedStatus };
}

/**
 * Shared gate for every lifecycle mutation: origin and content type, session, CSRF, recent
 * authentication, and an idempotency key. It mirrors the content-review routes so that publishing
 * is exactly as hard to trigger as approving, and never easier.
 */
async function authorizeMutation(
  request: Request,
  dependencies: {
    enabled: boolean;
    config: AdminAuthConfig;
    sessionStore?: unknown;
    now?: () => Date;
  },
): Promise<
  | { ok: true; actorUserId: string; idempotencyKey: string; mutation: ParsedMutation }
  | { ok: false; response: Response }
> {
  if (!dependencies.enabled || !dependencies.config.enabled || !dependencies.sessionStore) {
    return { ok: false, response: notFound() };
  }
  const config: EnabledAdminAuthConfig = dependencies.config;
  try {
    assertTrustedAdminMutation(request, config, ['application/json']);
  } catch {
    return { ok: false, response: genericInvalid() };
  }
  // Honour the injected clock, exactly as the GET route does. Reading wall-clock here made session
  // expiry non-deterministic and diverged the mutation path from the read path for no reason.
  const currentTime = (dependencies.now ?? (() => new Date()))();
  const session = await loadAdminSession(
    request,
    config,
    dependencies.sessionStore as Parameters<typeof loadAdminSession>[2],
    currentTime,
  );
  if (!session) return { ok: false, response: unauthorized() };
  try {
    verifyAdminCsrf(request, session.csrfHash, config);
  } catch {
    return { ok: false, response: genericInvalid() };
  }
  if (!session.recent) {
    return { ok: false, response: json({ code: 'reauthentication_required' }, { status: 428 }) };
  }

  const idempotencyKey = readIdempotencyKey(request);
  if (!idempotencyKey) return { ok: false, response: genericInvalid() };

  const body = await parseJsonBody(request);
  const mutation = body ? parseMutationBody(body) : undefined;
  if (!mutation) return { ok: false, response: genericInvalid() };

  return { ok: true, actorUserId: session.userId, idempotencyKey, mutation };
}

export function createPackLifecycleRoute(dependencies: LifecycleDependencies<'getPackLifecycle'>) {
  return async function GET(request: Request) {
    if (
      !dependencies.enabled ||
      !dependencies.config.enabled ||
      !dependencies.sessionStore ||
      !dependencies.store
    ) {
      return notFound();
    }
    const currentTime = (dependencies.now ?? (() => new Date()))();
    const session = await loadAdminSession(
      request,
      dependencies.config,
      dependencies.sessionStore,
      currentTime,
    );
    if (!session) return unauthorized();

    const packId = new URL(request.url).searchParams.get('packId');
    if (!packId || !packIdPattern.test(packId)) return genericInvalid();

    try {
      const result = await dependencies.store.getPackLifecycle({
        packId,
        actorUserId: session.userId,
      });
      if (result.status === 'forbidden' || result.status === 'not_found') return notFound();
      return json({ lifecycle: result.view });
    } catch {
      return unavailable();
    }
  };
}

function submitResponse(result: SubmitForReviewResult) {
  switch (result.status) {
    case 'applied':
      return json({
        status: 'applied',
        submittedCardCount: result.submittedCardCount,
        packStatus: result.packStatus,
      });
    case 'idempotent':
      return json({ status: 'idempotent', packStatus: result.packStatus });
    case 'nothing_to_submit':
      return json({ code: 'nothing_to_submit', packStatus: result.packStatus }, { status: 409 });
    case 'stale':
      return json({ code: 'stale', currentStatus: result.currentStatus }, { status: 409 });
    case 'forbidden':
    case 'not_found':
      return notFound();
  }
}

export function createPackSubmitForReviewRoute(
  dependencies: LifecycleDependencies<'submitPackForReview'>,
) {
  return async function POST(request: Request) {
    if (!dependencies.store) return notFound();
    const authorized = await authorizeMutation(request, dependencies);
    if (!authorized.ok) return authorized.response;
    try {
      const result = await dependencies.store.submitPackForReview({
        ...authorized.mutation,
        actorUserId: authorized.actorUserId,
        idempotencyKey: authorized.idempotencyKey,
      });
      return submitResponse(result);
    } catch {
      return unavailable();
    }
  };
}

function publishResponse(result: PublishPackResult) {
  switch (result.status) {
    case 'applied':
      return json({ status: 'applied', publishedCardCount: result.publishedCardCount });
    case 'idempotent':
      return json({ status: 'idempotent' });
    case 'not_ready':
      return json({ code: 'not_ready', readiness: result.readiness }, { status: 409 });
    case 'stale':
      return json({ code: 'stale', currentStatus: result.currentStatus }, { status: 409 });
    case 'forbidden':
    case 'not_found':
      return notFound();
  }
}

export function createPackPublishRoute(dependencies: LifecycleDependencies<'publishPack'>) {
  return async function POST(request: Request) {
    if (!dependencies.store) return notFound();
    const authorized = await authorizeMutation(request, dependencies);
    if (!authorized.ok) return authorized.response;
    try {
      const result = await dependencies.store.publishPack({
        ...authorized.mutation,
        actorUserId: authorized.actorUserId,
        idempotencyKey: authorized.idempotencyKey,
      });
      return publishResponse(result);
    } catch {
      return unavailable();
    }
  };
}

function archiveResponse(result: ArchivePackResult) {
  switch (result.status) {
    case 'applied':
      return json({ status: 'applied', deactivatedCardCount: result.deactivatedCardCount });
    case 'idempotent':
      return json({ status: 'idempotent' });
    case 'stale':
      return json({ code: 'stale', currentStatus: result.currentStatus }, { status: 409 });
    case 'forbidden':
    case 'not_found':
      return notFound();
  }
}

export function createPackArchiveRoute(dependencies: LifecycleDependencies<'archivePack'>) {
  return async function POST(request: Request) {
    if (!dependencies.store) return notFound();
    const authorized = await authorizeMutation(request, dependencies);
    if (!authorized.ok) return authorized.response;
    try {
      const result = await dependencies.store.archivePack({
        ...authorized.mutation,
        actorUserId: authorized.actorUserId,
        idempotencyKey: authorized.idempotencyKey,
      });
      return archiveResponse(result);
    } catch {
      return unavailable();
    }
  };
}
