import {
  assertTrustedAdminMutation,
  type AdminAuthConfig,
  type EnabledAdminAuthConfig,
} from './admin-auth-policy';
import { loadAdminSession, verifyAdminCsrf } from './admin-route-security';
import {
  isAccountStatus,
  type PostgresAdminUsersStore,
  type SetUserStatusResult,
} from './postgres-admin-users-store';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Long enough for a real explanation, bounded so the audit trail is not free-form storage. */
const maxReason = 500;
const minReason = 3;
/** A support search is a lookup, not a query language. */
const maxSearch = 64;

type UsersDependencies<TMethod extends keyof PostgresAdminUsersStore> = {
  enabled: boolean;
  config: AdminAuthConfig;
  sessionStore?: Parameters<typeof loadAdminSession>[2];
  store?: Pick<PostgresAdminUsersStore, TMethod>;
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
  return new Response('Account status unavailable', {
    status: 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}

/** Support data is personal data: never cached, never stored by an intermediary. */
function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store',
      ...(init?.headers ?? {}),
    },
  });
}

function readIdempotencyKey(request: Request): string | undefined {
  const value = request.headers.get('idempotency-key')?.trim();
  if (!value || value.length > 200) return undefined;
  return value;
}

async function parseJsonBody(request: Request): Promise<Record<string, unknown> | undefined> {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
    return body as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

type ParsedStatusChange = { userId: string; status: 'active' | 'disabled'; reason: string };

/**
 * The reason is a required field, not a courtesy. A suspension with no stated cause cannot be
 * reviewed, explained to the learner, or undone by someone who was not in the room, so the route
 * refuses the mutation rather than writing an unexplained one.
 */
function parseStatusChange(body: Record<string, unknown>): ParsedStatusChange | undefined {
  const { userId, status, reason } = body;
  if (typeof userId !== 'string' || !uuidPattern.test(userId)) return undefined;
  if (!isAccountStatus(status)) return undefined;
  if (typeof reason !== 'string') return undefined;
  const trimmed = reason.trim();
  if (trimmed.length < minReason || trimmed.length > maxReason) return undefined;
  return { userId, status, reason: trimmed };
}

/**
 * Shared gate for the support mutation: Origin and content type, session, per-session CSRF, recent
 * re-authentication, idempotency key, then the body. Identical in shape to the Phase 1 lifecycle
 * and Phase 2 Store gates — suspending a learner's account is exactly as hard to trigger as
 * publishing content or changing what a pack costs.
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
  | { ok: true; actorUserId: string; idempotencyKey: string; change: ParsedStatusChange }
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
  const session = await loadAdminSession(
    request,
    config,
    dependencies.sessionStore as Parameters<typeof loadAdminSession>[2],
    (dependencies.now ?? (() => new Date()))(),
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
  const change = body ? parseStatusChange(body) : undefined;
  if (!change) return { ok: false, response: genericInvalid() };

  return { ok: true, actorUserId: session.userId, idempotencyKey, change };
}

export function createAdminUsersRoute(dependencies: UsersDependencies<'listUsers'>) {
  return async function GET(request: Request) {
    if (
      !dependencies.enabled ||
      !dependencies.config.enabled ||
      !dependencies.sessionStore ||
      !dependencies.store
    ) {
      return notFound();
    }
    const session = await loadAdminSession(
      request,
      dependencies.config,
      dependencies.sessionStore,
      (dependencies.now ?? (() => new Date()))(),
    );
    if (!session) return unauthorized();

    const search = new URL(request.url).searchParams.get('q')?.trim() ?? '';
    if (search.length > maxSearch) return genericInvalid();

    try {
      const result = await dependencies.store.listUsers({
        actorUserId: session.userId,
        search: search || undefined,
      });
      if (result.status === 'forbidden') return notFound();
      return json({ users: result.rows, total: result.total });
    } catch {
      return unavailable();
    }
  };
}

/**
 * `forbidden` and `not_found` deliberately collapse into the same 404: an operator without the
 * role learns nothing about which accounts exist.
 */
function statusResponse(result: SetUserStatusResult) {
  switch (result.status) {
    case 'applied':
    case 'idempotent':
    case 'unchanged':
      return json({ status: result.status, user: result.row });
    case 'forbidden':
    case 'not_found':
      return notFound();
  }
}

export function createAdminUserStatusRoute(dependencies: UsersDependencies<'setUserStatus'>) {
  return async function POST(request: Request) {
    if (!dependencies.store) return notFound();
    const authorized = await authorizeMutation(request, dependencies);
    if (!authorized.ok) return authorized.response;
    try {
      const result = await dependencies.store.setUserStatus({
        ...authorized.change,
        actorUserId: authorized.actorUserId,
        idempotencyKey: authorized.idempotencyKey,
      });
      return statusResponse(result);
    } catch {
      return unavailable();
    }
  };
}
