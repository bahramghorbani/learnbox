import {
  assertTrustedAdminMutation,
  type AdminAuthConfig,
  type EnabledAdminAuthConfig,
} from './admin-auth-policy';
import { loadAdminSession, verifyAdminCsrf } from './admin-route-security';
import {
  isStoreStatus,
  type PostgresStoreListingsStore,
  type StoreListingUpsert,
  type UpsertStoreListingResult,
} from './postgres-store-listings-store';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** `packs.id` is a canonical text slug, not a uuid. Mirrors the content-packs routes. */
const packIdPattern = /^[a-z0-9][a-z0-9-]{1,119}$/;

/** Bounded so a commercial blurb cannot be used as unbounded storage. */
const maxCommercialSummary = 2000;
const maxCoverObjectKey = 512;
/** Display order is an operator-chosen sort key, not an identifier. */
const maxDisplayOrder = 100000;

type StoreDependencies<TMethod extends keyof PostgresStoreListingsStore> = {
  enabled: boolean;
  config: AdminAuthConfig;
  sessionStore?: Parameters<typeof loadAdminSession>[2];
  store?: Pick<PostgresStoreListingsStore, TMethod>;
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
  return new Response('Store listings unavailable', {
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

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > max) return undefined;
  return trimmed;
}

type ParsedUpsert = Omit<StoreListingUpsert, 'actorUserId' | 'idempotencyKey'>;

/**
 * Validates the commercial payload and nothing else.
 *
 * Every accepted field belongs to `store_listings`. There is deliberately no branch for
 * displayName, description, category, price, isFree, cards or media: a content field arriving in a
 * Store request is simply ignored, so the Store surface cannot be used to edit pack content even
 * if a client sends it.
 */
function parseUpsertBody(body: Record<string, unknown>): ParsedUpsert | undefined {
  const { packId, storeStatus, featured, displayOrder, expectedStoreStatus } = body;
  if (typeof packId !== 'string' || !packIdPattern.test(packId)) return undefined;
  if (!isStoreStatus(storeStatus)) return undefined;
  if (typeof featured !== 'boolean') return undefined;
  if (
    typeof displayOrder !== 'number' ||
    !Number.isInteger(displayOrder) ||
    displayOrder < 0 ||
    displayOrder > maxDisplayOrder
  ) {
    return undefined;
  }
  if (
    expectedStoreStatus !== undefined &&
    expectedStoreStatus !== 'absent' &&
    !isStoreStatus(expectedStoreStatus)
  ) {
    return undefined;
  }

  const coverObjectKey = optionalText(body.coverObjectKey, maxCoverObjectKey);
  if (coverObjectKey === undefined) return undefined;
  const commercialSummary = optionalText(body.commercialSummary, maxCommercialSummary);
  if (commercialSummary === undefined) return undefined;

  return {
    packId,
    storeStatus,
    featured,
    displayOrder,
    coverObjectKey,
    commercialSummary,
    expectedStoreStatus: expectedStoreStatus as ParsedUpsert['expectedStoreStatus'],
  };
}

/**
 * Shared gate for the commercial mutation: origin and content type, session, CSRF, recent
 * authentication, idempotency key. Identical in shape to the Phase 1 lifecycle gate, so changing
 * what a pack costs the business is exactly as hard to trigger as publishing it.
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
  | { ok: true; actorUserId: string; idempotencyKey: string; upsert: ParsedUpsert }
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
  const upsert = body ? parseUpsertBody(body) : undefined;
  if (!upsert) return { ok: false, response: genericInvalid() };

  return { ok: true, actorUserId: session.userId, idempotencyKey, upsert };
}

export function createStoreListingsRoute(dependencies: StoreDependencies<'listStoreListings'>) {
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

    try {
      const result = await dependencies.store.listStoreListings({ actorUserId: session.userId });
      if (result.status === 'forbidden') return notFound();
      return json({ listings: result.rows });
    } catch {
      return unavailable();
    }
  };
}

function upsertResponse(result: UpsertStoreListingResult) {
  switch (result.status) {
    case 'applied':
      return json({ status: 'applied', listing: result.row });
    case 'idempotent':
      return json({ status: 'idempotent', listing: result.row });
    case 'stale':
      return json(
        { code: 'stale', currentStoreStatus: result.currentStoreStatus },
        { status: 409 },
      );
    case 'forbidden':
    case 'not_found':
      return notFound();
  }
}

export function createStoreListingUpsertRoute(
  dependencies: StoreDependencies<'upsertStoreListing'>,
) {
  return async function PUT(request: Request) {
    if (!dependencies.store) return notFound();
    const authorized = await authorizeMutation(request, dependencies);
    if (!authorized.ok) return authorized.response;
    try {
      const result = await dependencies.store.upsertStoreListing({
        ...authorized.upsert,
        actorUserId: authorized.actorUserId,
        idempotencyKey: authorized.idempotencyKey,
      });
      return upsertResponse(result);
    } catch {
      return unavailable();
    }
  };
}
