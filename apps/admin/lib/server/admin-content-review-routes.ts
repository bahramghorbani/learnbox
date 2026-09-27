import {
  assertTrustedAdminMutation,
  type AdminAuthConfig,
  type EnabledAdminAuthConfig,
} from './admin-auth-policy';
import { loadAdminSession, verifyAdminCsrf } from './admin-route-security';
import {
  contentReviewDimensions,
  type ContentReviewCheckSubmission,
  type ContentReviewCheckWriteResult,
  type ContentReviewDecisionSubmission,
  type ContentReviewDecisionWriteResult,
  type ContentReviewDimension,
  type PostgresContentReviewStore,
} from './postgres-content-review-store';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const idempotencyKeyPattern = uuidPattern;
const maximumNotesLength = 1_200;

type QueueDependencies = {
  enabled: boolean;
  config: AdminAuthConfig;
  sessionStore?: Parameters<typeof loadAdminSession>[2];
  store?: Pick<PostgresContentReviewStore, 'listReviewQueue'>;
  now?: () => Date;
};

type CheckDependencies = {
  enabled: boolean;
  config: AdminAuthConfig;
  sessionStore?: Parameters<typeof loadAdminSession>[2];
  store?: Pick<PostgresContentReviewStore, 'recordCheck'>;
  now?: () => Date;
};

type DecisionDependencies = {
  enabled: boolean;
  config: AdminAuthConfig;
  sessionStore?: Parameters<typeof loadAdminSession>[2];
  store?: Pick<PostgresContentReviewStore, 'submitDecision'>;
  now?: () => Date;
};

function notFound() {
  return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
}

function unauthorized() {
  return new Response('Unauthorized', {
    status: 401,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function genericInvalid() {
  return new Response('Invalid request', {
    status: 400,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function unavailable() {
  return new Response('Content review unavailable', {
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
  if (!value || !idempotencyKeyPattern.test(value)) return undefined;
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

function parseCheckBody(body: Record<string, unknown>): ContentReviewCheckSubmission | undefined {
  if (!isRecord(body)) return undefined;
  const { cardVersionId, dimension, outcome, notes } = body;
  if (typeof cardVersionId !== 'string' || !uuidPattern.test(cardVersionId)) return undefined;
  if (
    typeof dimension !== 'string' ||
    !(contentReviewDimensions as readonly string[]).includes(dimension)
  ) {
    return undefined;
  }
  if (outcome !== 'passed' && outcome !== 'failed') return undefined;
  if (notes !== undefined && (typeof notes !== 'string' || notes.length > maximumNotesLength)) {
    return undefined;
  }
  return {
    cardVersionId,
    dimension: dimension as ContentReviewDimension,
    outcome,
    notes: typeof notes === 'string' ? notes : undefined,
    idempotencyKey: '',
  };
}

function parseDecisionBody(
  body: Record<string, unknown>,
): Omit<ContentReviewDecisionSubmission, 'decisionKey'> | undefined {
  if (!isRecord(body)) return undefined;
  const { cardVersionId, action, reason } = body;
  if (typeof cardVersionId !== 'string' || !uuidPattern.test(cardVersionId)) return undefined;
  if (action !== 'approve' && action !== 'reject' && action !== 'return_for_revision')
    return undefined;
  if (reason !== undefined && (typeof reason !== 'string' || reason.length > maximumNotesLength)) {
    return undefined;
  }
  return {
    cardVersionId,
    action,
    reason: typeof reason === 'string' ? reason : undefined,
  };
}

export function createContentReviewQueueRoute(dependencies: QueueDependencies) {
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
      const result = await dependencies.store.listReviewQueue(session.userId);
      if (result.status === 'forbidden') return notFound();
      return json({ items: result.items });
    } catch {
      return unavailable();
    }
  };
}

function checkWriteResponse(result: ContentReviewCheckWriteResult) {
  switch (result.status) {
    case 'applied':
      return json({ status: 'applied' });
    case 'idempotent':
      return json({ status: 'idempotent' });
    case 'conflict':
      return json({ code: 'conflict' }, { status: 409 });
    case 'not_reviewable':
      return json({ code: 'not_reviewable', currentStatus: result.currentStatus }, { status: 409 });
    case 'forbidden':
    case 'not_found':
      return notFound();
  }
}

export function createContentReviewCheckRoute(dependencies: CheckDependencies) {
  return async function POST(request: Request) {
    if (
      !dependencies.enabled ||
      !dependencies.config.enabled ||
      !dependencies.sessionStore ||
      !dependencies.store
    ) {
      return notFound();
    }
    const config: EnabledAdminAuthConfig = dependencies.config;
    try {
      assertTrustedAdminMutation(request, config, ['application/json']);
    } catch {
      return genericInvalid();
    }
    const currentTime = (dependencies.now ?? (() => new Date()))();
    const session = await loadAdminSession(request, config, dependencies.sessionStore, currentTime);
    if (!session) return unauthorized();
    try {
      verifyAdminCsrf(request, session.csrfHash, config);
    } catch {
      return genericInvalid();
    }
    if (!session.recent) {
      return json({ code: 'reauthentication_required' }, { status: 428 });
    }

    const idempotencyKey = readIdempotencyKey(request);
    if (!idempotencyKey) return genericInvalid();

    const body = await parseJsonBody(request);
    const parsed = body ? parseCheckBody(body) : undefined;
    if (!parsed) return genericInvalid();

    try {
      const result = await dependencies.store.recordCheck(session.userId, {
        ...parsed,
        idempotencyKey,
      });
      return checkWriteResponse(result);
    } catch {
      return unavailable();
    }
  };
}

function decisionWriteResponse(result: ContentReviewDecisionWriteResult) {
  switch (result.status) {
    case 'applied':
      return json({ status: 'applied', nextStatus: result.nextStatus });
    case 'idempotent':
      return json({ status: 'idempotent', action: result.action });
    case 'conflict':
      return json({ code: 'conflict' }, { status: 409 });
    case 'review_incomplete':
      return json(
        { code: 'review_incomplete', pendingDimensions: result.pendingDimensions },
        { status: 409 },
      );
    case 'not_reviewable':
      return json({ code: 'not_reviewable', currentStatus: result.currentStatus }, { status: 409 });
    case 'forbidden':
    case 'not_found':
      return notFound();
  }
}

export function createContentReviewDecisionRoute(dependencies: DecisionDependencies) {
  return async function POST(request: Request) {
    if (
      !dependencies.enabled ||
      !dependencies.config.enabled ||
      !dependencies.sessionStore ||
      !dependencies.store
    ) {
      return notFound();
    }
    const config: EnabledAdminAuthConfig = dependencies.config;
    try {
      assertTrustedAdminMutation(request, config, ['application/json']);
    } catch {
      return genericInvalid();
    }
    const currentTime = (dependencies.now ?? (() => new Date()))();
    const session = await loadAdminSession(request, config, dependencies.sessionStore, currentTime);
    if (!session) return unauthorized();
    try {
      verifyAdminCsrf(request, session.csrfHash, config);
    } catch {
      return genericInvalid();
    }
    if (!session.recent) {
      return json({ code: 'reauthentication_required' }, { status: 428 });
    }

    const decisionKey = readIdempotencyKey(request);
    if (!decisionKey) return genericInvalid();

    const body = await parseJsonBody(request);
    const parsed = body ? parseDecisionBody(body) : undefined;
    if (!parsed) return genericInvalid();

    try {
      const result = await dependencies.store.submitDecision({
        ...parsed,
        decisionKey,
        actorUserId: session.userId,
      });
      return decisionWriteResponse(result);
    } catch {
      return unavailable();
    }
  };
}
