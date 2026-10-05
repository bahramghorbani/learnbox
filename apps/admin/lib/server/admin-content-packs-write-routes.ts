import {
  assertTrustedAdminMutation,
  type AdminAuthConfig,
  type EnabledAdminAuthConfig,
} from './admin-auth-policy';
import { loadAdminSession, verifyAdminCsrf } from './admin-route-security';
import {
  type CardContentInput,
  type CardWriteResult,
  type PackWriteResult,
  type PostgresContentPacksWriteStore,
} from './postgres-content-packs-write-store';

/**
 * Phase 1 / Milestone 1.2 — Pack & Card management routes.
 *
 * The guard chain is copied verbatim from `admin-content-review-routes.ts`, in this exact order:
 *
 *   1. feature/config gate            → 404 (route does not exist when disabled)
 *   2. `assertTrustedAdminMutation`   → Origin + Content-Type (blocks cross-site form posts)
 *   3. `loadAdminSession`             → 401 when unauthenticated
 *   4. `verifyAdminCsrf`              → per-session CSRF token
 *   5. `session.recent`               → 428 reauthentication_required for content writes
 *   6. `Idempotency-Key`              → required uuid, enforced by the store
 *
 * Roles are never read from the request: the store resolves them from `admin_role_assignments`
 * inside the write transaction, so a valid session with no editorial role still gets 403.
 */

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type WriteStore = PostgresContentPacksWriteStore;

type RouteDependencies<Method extends keyof WriteStore> = {
  enabled: boolean;
  config: AdminAuthConfig;
  sessionStore?: Parameters<typeof loadAdminSession>[2];
  store?: Pick<WriteStore, Method>;
  now?: () => Date;
};

function notFound() {
  return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

function unauthorized() {
  return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });
}

function forbidden() {
  return new Response('Forbidden', { status: 403, headers: { 'Cache-Control': 'no-store' } });
}

function genericInvalid() {
  return new Response('Invalid request', { status: 400, headers: { 'Cache-Control': 'no-store' } });
}

function unavailable() {
  return new Response('Content packs unavailable', {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

/** Parses the editable educational surface. Shape errors become 400; content rules are the
 *  canonical validator's job, reported as a structured 422. */
function parseCardContent(body: Record<string, unknown>): CardContentInput | undefined {
  const lemma = optionalString(body.lemma);
  if (lemma === undefined) return undefined;
  const examplesRaw = Array.isArray(body.examples) ? body.examples : [];
  const examples: Array<{ german: string; persian: string }> = [];
  for (const entry of examplesRaw) {
    if (!isRecord(entry)) return undefined;
    examples.push({
      german: typeof entry.german === 'string' ? entry.german : '',
      persian: typeof entry.persian === 'string' ? entry.persian : '',
    });
  }
  const difficulty = Number(body.difficulty ?? 1);
  if (!Number.isFinite(difficulty)) return undefined;
  return {
    lemma,
    article: optionalString(body.article),
    partOfSpeech: optionalString(body.partOfSpeech),
    essentialInflection: optionalString(body.essentialInflection),
    pronunciationIpa: optionalString(body.pronunciationIpa),
    persianMeanings: stringArray(body.persianMeanings),
    examples,
    simpleGermanDefinition: optionalString(body.simpleGermanDefinition) ?? '',
    grammarNote: optionalString(body.grammarNote) ?? '',
    topicTags: stringArray(body.topicTags),
    difficulty,
    cefr: optionalString(body.cefr),
    visualConcept: optionalString(body.visualConcept) ?? '',
    imagePrompt: optionalString(body.imagePrompt) ?? '',
    sourceReference: optionalString(body.sourceReference) ?? '',
  };
}

function packWriteResponse(result: PackWriteResult) {
  switch (result.status) {
    case 'forbidden':
      return forbidden();
    case 'not_found':
      return notFound();
    case 'invalid':
      return json({ code: 'invalid_content', issues: result.issues }, { status: 422 });
    case 'conflict':
      return json({ code: 'conflict', reason: result.reason }, { status: 409 });
    case 'idempotent':
      return json({ status: 'idempotent', packId: result.packId });
    default:
      return json({ status: 'applied', packId: result.packId });
  }
}

function cardWriteResponse(result: CardWriteResult) {
  switch (result.status) {
    case 'forbidden':
      return forbidden();
    case 'not_found':
      return notFound();
    case 'invalid':
      return json({ code: 'invalid_content', issues: result.issues }, { status: 422 });
    case 'conflict':
      return json({ code: 'conflict', reason: result.reason }, { status: 409 });
    case 'idempotent':
      return json({
        status: 'idempotent',
        cardId: result.cardId,
        cardVersionId: result.cardVersionId,
      });
    default:
      return json({
        status: 'applied',
        cardId: result.cardId,
        cardVersionId: result.cardVersionId,
        version: result.version,
      });
  }
}

/** Runs the shared mutation guard chain. Returns either a rejection Response or the actor. */
async function authorizeMutation(
  request: Request,
  dependencies: { config: AdminAuthConfig; sessionStore?: Parameters<typeof loadAdminSession>[2] },
  now: Date,
): Promise<{ response: Response } | { actorUserId: string; idempotencyKey: string }> {
  const config = dependencies.config as EnabledAdminAuthConfig;
  try {
    assertTrustedAdminMutation(request, config, ['application/json']);
  } catch {
    return { response: genericInvalid() };
  }
  const session = await loadAdminSession(request, config, dependencies.sessionStore!, now);
  if (!session) return { response: unauthorized() };
  try {
    verifyAdminCsrf(request, session.csrfHash, config);
  } catch {
    return { response: genericInvalid() };
  }
  if (!session.recent) {
    return { response: json({ code: 'reauthentication_required' }, { status: 428 }) };
  }
  const idempotencyKey = readIdempotencyKey(request);
  if (!idempotencyKey) return { response: genericInvalid() };
  return { actorUserId: session.userId, idempotencyKey };
}

export function createContentPackCreateRoute(dependencies: RouteDependencies<'createPack'>) {
  return async function POST(request: Request) {
    if (
      !dependencies.enabled ||
      !dependencies.config.enabled ||
      !dependencies.sessionStore ||
      !dependencies.store
    ) {
      return notFound();
    }
    const now = (dependencies.now ?? (() => new Date()))();
    const authorized = await authorizeMutation(request, dependencies, now);
    if ('response' in authorized) return authorized.response;

    const body = await parseJsonBody(request);
    if (!body) return genericInvalid();
    const packId = optionalString(body.packId);
    const displayName = optionalString(body.displayName);
    if (packId === undefined || displayName === undefined) return genericInvalid();

    try {
      const result = await dependencies.store.createPack({
        packId,
        displayName,
        description: optionalString(body.description),
        locale: optionalString(body.locale),
        targetCefr: optionalString(body.targetCefr),
        targetItemCount:
          body.targetItemCount === undefined ? undefined : Number(body.targetItemCount),
        category: optionalString(body.category),
        isFree: body.isFree === true,
        idempotencyKey: authorized.idempotencyKey,
        actorUserId: authorized.actorUserId,
      });
      return packWriteResponse(result);
    } catch {
      return unavailable();
    }
  };
}

export function createContentPackEditRoute(dependencies: RouteDependencies<'editPack'>) {
  return async function PATCH(request: Request, context: { params: Promise<{ packId: string }> }) {
    if (
      !dependencies.enabled ||
      !dependencies.config.enabled ||
      !dependencies.sessionStore ||
      !dependencies.store
    ) {
      return notFound();
    }
    const now = (dependencies.now ?? (() => new Date()))();
    const authorized = await authorizeMutation(request, dependencies, now);
    if ('response' in authorized) return authorized.response;

    const { packId } = await context.params;
    const body = await parseJsonBody(request);
    if (!body) return genericInvalid();

    try {
      const result = await dependencies.store.editPack({
        packId,
        displayName: optionalString(body.displayName),
        description: optionalString(body.description),
        targetCefr: optionalString(body.targetCefr),
        category: optionalString(body.category),
        targetItemCount:
          body.targetItemCount === undefined ? undefined : Number(body.targetItemCount),
        isFree: body.isFree === undefined ? undefined : body.isFree === true,
        idempotencyKey: authorized.idempotencyKey,
        actorUserId: authorized.actorUserId,
      });
      return packWriteResponse(result);
    } catch {
      return unavailable();
    }
  };
}

export function createContentCardCreateRoute(dependencies: RouteDependencies<'createCard'>) {
  return async function POST(request: Request, context: { params: Promise<{ packId: string }> }) {
    if (
      !dependencies.enabled ||
      !dependencies.config.enabled ||
      !dependencies.sessionStore ||
      !dependencies.store
    ) {
      return notFound();
    }
    const now = (dependencies.now ?? (() => new Date()))();
    const authorized = await authorizeMutation(request, dependencies, now);
    if ('response' in authorized) return authorized.response;

    const { packId } = await context.params;
    const body = await parseJsonBody(request);
    if (!body) return genericInvalid();
    const content = parseCardContent(body);
    if (!content) return genericInvalid();

    try {
      const result = await dependencies.store.createCard({
        packId,
        content,
        sortOrder: body.sortOrder === undefined ? undefined : Number(body.sortOrder),
        idempotencyKey: authorized.idempotencyKey,
        actorUserId: authorized.actorUserId,
      });
      return cardWriteResponse(result);
    } catch {
      return unavailable();
    }
  };
}

export function createContentCardEditRoute(dependencies: RouteDependencies<'editCard'>) {
  return async function PATCH(request: Request, context: { params: Promise<{ cardId: string }> }) {
    if (
      !dependencies.enabled ||
      !dependencies.config.enabled ||
      !dependencies.sessionStore ||
      !dependencies.store
    ) {
      return notFound();
    }
    const now = (dependencies.now ?? (() => new Date()))();
    const authorized = await authorizeMutation(request, dependencies, now);
    if ('response' in authorized) return authorized.response;

    const { cardId } = await context.params;
    const body = await parseJsonBody(request);
    if (!body) return genericInvalid();
    const content = parseCardContent(body);
    if (!content) return genericInvalid();

    try {
      const result = await dependencies.store.editCard({
        cardId,
        content,
        idempotencyKey: authorized.idempotencyKey,
        actorUserId: authorized.actorUserId,
      });
      return cardWriteResponse(result);
    } catch {
      return unavailable();
    }
  };
}
