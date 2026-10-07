import {
  assertTrustedAdminMutation,
  type AdminAuthConfig,
  type EnabledAdminAuthConfig,
} from './admin-auth-policy';
import { loadAdminSession, verifyAdminCsrf } from './admin-route-security';
import {
  isAccountStatus,
  type PostgresAdminUsersStore,
  type SetPackEntitlementResult,
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
  return new Response('Support data unavailable', {
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
async function authorizeMutation<TChange>(
  request: Request,
  dependencies: {
    enabled: boolean;
    config: AdminAuthConfig;
    sessionStore?: unknown;
    now?: () => Date;
  },
  parse: (body: Record<string, unknown>) => TChange | undefined,
): Promise<
  | { ok: true; actorUserId: string; idempotencyKey: string; change: TChange }
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
  const change = body ? parse(body) : undefined;
  if (change === undefined) return { ok: false, response: genericInvalid() };

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
    const authorized = await authorizeMutation(request, dependencies, parseStatusChange);
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

/** `packs.id` is a human-authored slug, not a UUID. Bounded and charset-checked, nothing more. */
const packIdPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

type ParsedEntitlementChange = {
  userId: string;
  packId: string;
  action: 'grant' | 'revoke';
  reason: string;
};

/** Same required reason as a suspension, in BOTH directions. */
function parseEntitlementChange(
  body: Record<string, unknown>,
): ParsedEntitlementChange | undefined {
  const { userId, packId, action, reason } = body;
  if (typeof userId !== 'string' || !uuidPattern.test(userId)) return undefined;
  if (typeof packId !== 'string' || !packIdPattern.test(packId)) return undefined;
  if (action !== 'grant' && action !== 'revoke') return undefined;
  if (typeof reason !== 'string') return undefined;
  const trimmed = reason.trim();
  if (trimmed.length < minReason || trimmed.length > maxReason) return undefined;
  return { userId, packId, action, reason: trimmed };
}

/** The learner's canonical pack access, as support sees it. Read-only; no mutation path here. */
export function createAdminUserPacksRoute(dependencies: UsersDependencies<'readPackEntitlements'>) {
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

    const userId = new URL(request.url).searchParams.get('userId')?.trim() ?? '';
    if (!uuidPattern.test(userId)) return genericInvalid();

    try {
      const result = await dependencies.store.readPackEntitlements({
        actorUserId: session.userId,
        userId,
      });
      if (result.status !== 'ok') return notFound();
      return json({ packs: result.rows });
    } catch {
      return unavailable();
    }
  };
}

/**
 * `refused` is a 409, not a 400: the request was well formed and the operator was authorized, but
 * the action is not legitimate for this entitlement's provenance — a verified purchase, a pack that
 * is free to everyone, or an entitlement that is not there. The verdict is returned so the screen
 * can say which, and the refreshed row so it stops showing a control that was never valid.
 */
function entitlementResponse(result: SetPackEntitlementResult) {
  switch (result.status) {
    case 'applied':
    case 'idempotent':
      return json({ status: result.status, pack: result.row });
    case 'refused':
      return json(
        { status: 'refused', verdict: result.verdict, pack: result.row },
        { status: 409 },
      );
    case 'forbidden':
    case 'not_found':
      return notFound();
  }
}

export function createAdminUserPackEntitlementRoute(
  dependencies: UsersDependencies<'setPackEntitlement'>,
) {
  return async function POST(request: Request) {
    if (!dependencies.store) return notFound();
    const authorized = await authorizeMutation(request, dependencies, parseEntitlementChange);
    if (!authorized.ok) return authorized.response;
    try {
      const result = await dependencies.store.setPackEntitlement({
        ...authorized.change,
        actorUserId: authorized.actorUserId,
        idempotencyKey: authorized.idempotencyKey,
      });
      return entitlementResponse(result);
    } catch {
      return unavailable();
    }
  };
}

/** `action` and `entity_type` are producer-written identifiers, not free text. */
const auditTokenPattern = /^[a-z0-9][a-z0-9_.-]{0,63}$/i;

/** Accepts only what `Date` can parse unambiguously; the value reaches SQL as a bound parameter. */
function parseInstant(value: string | null): string | undefined | null {
  if (value === null || value.trim() === '') return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseCount(value: string | null, fallback: number): number | null {
  if (value === null || value.trim() === '') return fallback;
  if (!/^\d{1,6}$/.test(value.trim())) return null;
  return Number(value.trim());
}

/**
 * The Audit Log viewer (Phase 3 / M3.3). GET only, by design: the canonical trail is append-only
 * evidence, so this surface exports no POST, PUT, PATCH or DELETE and the store it calls issues
 * nothing but SELECT. There is no "edit audit record" path to defend because none exists.
 *
 * Same authorization as every other support surface — a valid Admin session plus the operational
 * role, behind the default-off `LEARNBOX_ADMIN_SUPPORT_ENABLED` gate. A role-less operator gets the
 * same 404 as a disabled deployment: an unauthorized caller learns nothing, not even that a trail
 * is there to read.
 *
 * A malformed filter is a 400 and never a silently ignored one — an audit search that quietly
 * dropped a date bound would show a reviewer a page they would reasonably mistake for the truth.
 */
export function createAdminAuditLogRoute(dependencies: UsersDependencies<'listAuditLog'>) {
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

    const params = new URL(request.url).searchParams;
    const action = params.get('action')?.trim() || undefined;
    const entityType = params.get('entityType')?.trim() || undefined;
    const actorUserId = params.get('actorUserId')?.trim() || undefined;
    const entityId = params.get('entityId')?.trim() || undefined;
    if (action && !auditTokenPattern.test(action)) return genericInvalid();
    if (entityType && !auditTokenPattern.test(entityType)) return genericInvalid();
    if (actorUserId && !uuidPattern.test(actorUserId)) return genericInvalid();
    if (entityId && !uuidPattern.test(entityId)) return genericInvalid();

    const from = parseInstant(params.get('from'));
    const to = parseInstant(params.get('to'));
    const limit = parseCount(params.get('limit'), 25);
    const offset = parseCount(params.get('offset'), 0);
    if (from === null || to === null || limit === null || offset === null) return genericInvalid();

    try {
      const result = await dependencies.store.listAuditLog({
        actorUserId: session.userId,
        filters: { action, entityType, actorUserId, entityId, from, to },
        limit,
        offset,
      });
      if (result.status === 'forbidden') return notFound();
      return json({
        entries: result.rows,
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        actions: result.actions,
        entityTypes: result.entityTypes,
        actors: result.actors,
      });
    } catch {
      return unavailable();
    }
  };
}
