import {
  assertTrustedAdminMutation,
  type AdminAuthConfig,
  type EnabledAdminAuthConfig,
} from './admin-auth-policy';
import { loadAdminSession, verifyAdminCsrf } from './admin-route-security';
import {
  dictionaryEditorialStatuses,
  type DictionaryEditorialStatus,
  type PostgresDictionaryEditorialStore,
} from './postgres-dictionary-editorial-store';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type Deps = {
  enabled: boolean;
  config: AdminAuthConfig;
  sessionStore?: Parameters<typeof loadAdminSession>[2];
  store?: Pick<PostgresDictionaryEditorialStore, 'list' | 'create' | 'update'>;
  now?: () => Date;
};
const noStore = { 'Cache-Control': 'no-store' };
const missing = () => new Response('Not found', { status: 404, headers: noStore });
const invalid = () => new Response('Invalid request', { status: 400, headers: noStore });
const unavailable = () =>
  new Response('Dictionary editorial unavailable', { status: 503, headers: noStore });
const json = (body: unknown, init?: ResponseInit) =>
  Response.json(body, { ...init, headers: { ...noStore, ...init?.headers } });
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const dictionaryPayload = (value: unknown, key: string) => record(value) && value.lemma === key;
function key(request: Request) {
  const value = request.headers.get('idempotency-key');
  return value && uuid.test(value) ? value : undefined;
}
async function actor(request: Request, deps: Deps, mutation: boolean) {
  if (!deps.enabled || !deps.config.enabled || !deps.sessionStore || !deps.store) return undefined;
  if (mutation) {
    try {
      assertTrustedAdminMutation(request, deps.config as EnabledAdminAuthConfig, [
        'application/json',
      ]);
    } catch {
      return null;
    }
  }
  const session = await loadAdminSession(
    request,
    deps.config,
    deps.sessionStore,
    (deps.now ?? (() => new Date()))(),
  );
  if (!session) return false;
  if (mutation) {
    try {
      verifyAdminCsrf(request, session.csrfHash, deps.config as EnabledAdminAuthConfig);
    } catch {
      return null;
    }
    if (!session.recent) return 'recent' as const;
  }
  return session.userId;
}
export function createDictionaryEditorialListRoute(deps: Deps) {
  return async (request: Request) => {
    const user = await actor(request, deps, false);
    if (user === undefined) return missing();
    if (!user) return new Response('Unauthorized', { status: 401, headers: noStore });
    try {
      const result = await deps.store!.list(user);
      return result.status === 'forbidden' ? missing() : json({ items: result.items });
    } catch {
      return unavailable();
    }
  };
}
export function createDictionaryEditorialCreateRoute(deps: Deps) {
  return async (request: Request) => {
    const user = await actor(request, deps, true);
    if (user === undefined) return missing();
    if (user === null) return invalid();
    if (user === false) return new Response('Unauthorized', { status: 401, headers: noStore });
    if (user === 'recent') return json({ code: 'reauthentication_required' }, { status: 428 });
    const idempotencyKey = key(request);
    let body: Record<string, unknown> | undefined;
    try {
      body = await request.json();
    } catch {
      /* invalid */
    }
    if (
      !idempotencyKey ||
      !record(body) ||
      typeof body.dictionaryKey !== 'string' ||
      !body.dictionaryKey.trim() ||
      body.dictionaryKey.length > 500 ||
      !dictionaryPayload(body.aiPayload, body.dictionaryKey.trim()) ||
      typeof body.source !== 'string' ||
      !body.source.trim() ||
      body.source.length > 200 ||
      (body.model !== undefined && (typeof body.model !== 'string' || body.model.length > 200)) ||
      (body.costMetadata !== undefined && !record(body.costMetadata))
    )
      return invalid();
    const aiPayload = body.aiPayload as Record<string, unknown>;
    try {
      const result = await deps.store!.create(user, {
        dictionaryKey: body.dictionaryKey.trim(),
        aiPayload,
        source: body.source.trim(),
        model: typeof body.model === 'string' ? body.model : null,
        costMetadata: record(body.costMetadata) ? body.costMetadata : {},
        idempotencyKey,
      });
      if (result.status === 'forbidden') return missing();
      if (result.status === 'duplicate')
        return json({ code: 'dictionary_key_exists' }, { status: 409 });
      return json({ status: result.status, item: result.item });
    } catch {
      return unavailable();
    }
  };
}
export function createDictionaryEditorialUpdateRoute(deps: Deps) {
  return async (request: Request, id: string) => {
    const user = await actor(request, deps, true);
    if (user === undefined) return missing();
    if (user === null) return invalid();
    if (user === false) return new Response('Unauthorized', { status: 401, headers: noStore });
    if (user === 'recent') return json({ code: 'reauthentication_required' }, { status: 428 });
    const idempotencyKey = key(request);
    let body: Record<string, unknown> | undefined;
    try {
      body = await request.json();
    } catch {
      /* invalid */
    }
    if (
      !uuid.test(id) ||
      !idempotencyKey ||
      !record(body) ||
      typeof body.revision !== 'number' ||
      !Number.isSafeInteger(body.revision) ||
      body.revision < 1 ||
      (!Object.hasOwn(body, 'manualPayload') && !Object.hasOwn(body, 'status')) ||
      (Object.hasOwn(body, 'manualPayload') &&
        body.manualPayload !== null &&
        !record(body.manualPayload)) ||
      (body.status !== undefined &&
        !(dictionaryEditorialStatuses as readonly string[]).includes(body.status as string))
    )
      return invalid();
    try {
      const result = await deps.store!.update(user, id, {
        revision: Number(body.revision),
        ...(Object.hasOwn(body, 'manualPayload')
          ? { manualPayload: body.manualPayload as Record<string, unknown> | null }
          : {}),
        ...(body.status ? { status: body.status as DictionaryEditorialStatus } : {}),
        idempotencyKey,
      });
      if (result.status === 'forbidden' || result.status === 'not_found') return missing();
      if (result.status === 'conflict') return json({ code: 'revision_conflict' }, { status: 409 });
      return json({ status: result.status, item: result.item });
    } catch {
      return unavailable();
    }
  };
}
