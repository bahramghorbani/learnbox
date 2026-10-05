import {
  assertTrustedAdminMutation,
  type AdminAuthConfig,
  type EnabledAdminAuthConfig,
} from './admin-auth-policy';
import { loadAdminSession, verifyAdminCsrf } from './admin-route-security';
import type { AiTextProvider } from './ai-generation-provider';
import type { AiPackGenerationService } from './ai-pack-generation-service';

/**
 * Phase 1 / Milestone 1.4 — AI pack generation routes.
 *
 * Same guard chain as M1.2/M1.3: Origin → session → CSRF → recent re-auth, on every route
 * including the read ones. These are generation endpoints, so an unauthenticated caller must never
 * reach the provider — that would make LearnBox's credential a public text-generation service.
 *
 * `provider_not_configured` is answered as an honest 503. There is no fallback provider and no
 * sample data: when the credential is absent, generation is unavailable rather than fake.
 */

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Selection ceiling, matched to the maximum a single job can generate. */
export const MAX_SELECTED_ROWS = 500;

type RouteDependencies = {
  enabled: boolean;
  config: AdminAuthConfig;
  sessionStore?: Parameters<typeof loadAdminSession>[2];
  service?: AiPackGenerationService;
  /** Present only when a credential is configured; used by the model-catalog route. */
  provider?: AiTextProvider;
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
function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: { 'Cache-Control': 'no-store', ...init?.headers },
  });
}

/**
 * Authorizes a generation request.
 *
 * Note the ordering: authentication runs BEFORE the provider-availability check, so an
 * unconfigured provider never leaks its state to an anonymous caller.
 */
async function authorize(
  request: Request,
  dependencies: RouteDependencies,
  options: { requireCsrf?: boolean } = {},
): Promise<{ response: Response } | { actorUserId: string }> {
  if (!dependencies.config.enabled || !dependencies.sessionStore) {
    return { response: notFound() };
  }
  const config = dependencies.config as EnabledAdminAuthConfig;
  // Opted out only by the read-only GET catalog route: a GET carries no body and changes nothing,
  // so a CSRF token is not applicable. Session, origin and recent-re-auth still gate it.
  const requireCsrf = options.requireCsrf !== false;
  if (requireCsrf) {
    try {
      assertTrustedAdminMutation(request, config, ['application/json']);
    } catch {
      return { response: genericInvalid() };
    }
  }
  const now = (dependencies.now ?? (() => new Date()))();
  const session = await loadAdminSession(request, config, dependencies.sessionStore, now);
  if (!session) return { response: unauthorized() };
  if (requireCsrf) {
    try {
      verifyAdminCsrf(request, session.csrfHash, config);
    } catch {
      return { response: genericInvalid() };
    }
  }
  if (!session.recent) {
    return { response: json({ code: 'reauthentication_required' }, { status: 428 }) };
  }
  if (!dependencies.enabled || !dependencies.service) {
    return {
      response: json(
        { code: 'disabled', message: 'تولید با هوش مصنوعی فعال نیست.' },
        { status: 503 },
      ),
    };
  }
  return { actorUserId: session.userId };
}

/**
 * The single answer for "no credential is configured".
 *
 * Only the two routes that actually call the provider can reach it. Inspecting and accepting an
 * already-generated job never does, so reviewed content stays reachable if a key is rotated away.
 */
function providerNotConfigured() {
  return json(
    { code: 'provider_not_configured', message: 'سرویس هوش مصنوعی پیکربندی نشده است.' },
    { status: 503 },
  );
}

async function readJson(request: Request): Promise<Record<string, unknown> | undefined> {
  try {
    const body = await request.json();
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined;
    return body as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** POST — natural-language prompt → structured plan. Generates no cards and writes no content. */
export function createAiPlanRoute(dependencies: RouteDependencies) {
  return async function POST(request: Request) {
    const authorized = await authorize(request, dependencies);
    if ('response' in authorized) return authorized.response;
    const body = await readJson(request);
    if (!body || typeof body.prompt !== 'string') return genericInvalid();

    try {
      const result = await dependencies.service!.plan({
        prompt: body.prompt,
        actorUserId: authorized.actorUserId,
        // Optional: an unrecognised value is ignored by the service, which falls back to the
        // configured default rather than failing the request.
        model: typeof body.model === 'string' ? body.model : undefined,
      });
      if (result.status === 'provider_not_configured') return providerNotConfigured();
      if (result.status === 'invalid') {
        return json({ code: 'invalid_prompt', message: result.message }, { status: 422 });
      }
      if (result.status === 'provider_error') {
        return json({ code: result.code, message: result.message }, { status: 502 });
      }
      return json({ status: 'planned', job: result.job });
    } catch {
      // Intentionally not logged: AvalAI error bodies echo a masked fragment of the credential,
      // so the text must not reach logs. Fails closed with no fabricated plan.
      return json({ code: 'plan_failed' }, { status: 503 });
    }
  };
}

/**
 * GET — text models this account may select, for the Admin's model picker.
 *
 * Read-only and credential-free in its response: it returns model ids and the current default
 * only. An unreadable catalog is not an error — the Admin keeps the working default.
 */
export function createAiModelsRoute(dependencies: RouteDependencies) {
  return async function GET(request: Request) {
    const authorized = await authorize(request, dependencies, { requireCsrf: false });
    if ('response' in authorized) return authorized.response;
    const provider = dependencies.provider;
    if (!provider) return providerNotConfigured();
    try {
      const models = await provider.listTextModels();
      return json({
        models,
        defaultModel: provider.model,
        provider: provider.provider,
      });
    } catch {
      return json({ models: [], defaultModel: provider.model, provider: provider.provider });
    }
  };
}

/** POST — explicit plan approval. Only after this can a provider call generate cards. */
export function createAiApprovePlanRoute(dependencies: RouteDependencies) {
  return async function POST(request: Request) {
    const authorized = await authorize(request, dependencies);
    if ('response' in authorized) return authorized.response;
    const body = await readJson(request);
    if (!body) return genericInvalid();
    const jobId = body.jobId;
    const fingerprint = body.planFingerprint;
    if (typeof jobId !== 'string' || !uuidPattern.test(jobId)) return genericInvalid();
    if (typeof fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(fingerprint)) {
      return genericInvalid();
    }

    try {
      const result = await dependencies.service!.approvePlan({
        jobId,
        actorUserId: authorized.actorUserId,
        expectedPlanFingerprint: fingerprint,
      });
      if (result.status === 'provider_not_configured') return providerNotConfigured();
      if (result.status === 'not_found') return notFound();
      if (result.status === 'stale') {
        return json({ code: 'stale_plan', message: result.message }, { status: 409 });
      }
      if (result.status === 'conflict') {
        return json({ code: 'conflict', message: result.message }, { status: 409 });
      }
      if (result.status === 'failed') return json({ status: 'failed', job: result.job });
      return json({ status: 'generating', job: result.job });
    } catch {
      return json({ code: 'approve_failed' }, { status: 503 });
    }
  };
}

/** POST — run ONE generation batch. The UI calls this repeatedly; the service is single-flight. */
export function createAiRunBatchRoute(dependencies: RouteDependencies) {
  return async function POST(request: Request) {
    const authorized = await authorize(request, dependencies);
    if ('response' in authorized) return authorized.response;
    const body = await readJson(request);
    if (!body || typeof body.jobId !== 'string' || !uuidPattern.test(body.jobId)) {
      return genericInvalid();
    }

    try {
      const result = await dependencies.service!.runNextBatch({
        jobId: body.jobId,
        actorUserId: authorized.actorUserId,
      });
      if (result.status === 'provider_not_configured') return providerNotConfigured();
      if (result.status === 'not_found') return notFound();
      if (result.status === 'stale') {
        return json({ code: 'stale_plan', message: result.message }, { status: 409 });
      }
      if (result.status === 'conflict') {
        return json({ code: 'batch_conflict', message: result.message }, { status: 409 });
      }
      if (result.status === 'failed') return json({ status: 'failed', job: result.job });
      return json({ status: result.job.status, job: result.job });
    } catch {
      return json({ code: 'generation_failed' }, { status: 503 });
    }
  };
}

/** POST — job state plus the canonical analysis of what has been generated so far. No writes. */
export function createAiJobStatusRoute(dependencies: RouteDependencies) {
  return async function POST(request: Request) {
    const authorized = await authorize(request, dependencies);
    if ('response' in authorized) return authorized.response;
    const body = await readJson(request);
    if (!body || typeof body.jobId !== 'string' || !uuidPattern.test(body.jobId)) {
      return genericInvalid();
    }

    try {
      const result = await dependencies.service!.analyzeJob({
        jobId: body.jobId,
        actorUserId: authorized.actorUserId,
      });
      if (result.status === 'not_found') return notFound();
      return json({ status: 'ok', job: result.job, analysis: result.analysis });
    } catch {
      return json({ code: 'status_failed' }, { status: 503 });
    }
  };
}

/** POST — accept EXPLICITLY selected generated cards into canonical draft content. */
export function createAiAcceptRoute(dependencies: RouteDependencies) {
  return async function POST(request: Request) {
    const authorized = await authorize(request, dependencies);
    if ('response' in authorized) return authorized.response;
    const body = await readJson(request);
    if (!body) return genericInvalid();
    const { jobId, fingerprint, acceptKey, selectedRows } = body;
    if (typeof jobId !== 'string' || !uuidPattern.test(jobId)) return genericInvalid();
    if (typeof fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(fingerprint)) {
      return genericInvalid();
    }
    // The accept key is the retry anchor: the same key re-sent is a no-op, never a second card.
    if (typeof acceptKey !== 'string' || !uuidPattern.test(acceptKey)) return genericInvalid();
    if (
      !Array.isArray(selectedRows) ||
      selectedRows.length === 0 ||
      selectedRows.length > MAX_SELECTED_ROWS ||
      !selectedRows.every((value) => Number.isSafeInteger(value) && (value as number) > 0)
    ) {
      return genericInvalid();
    }

    try {
      const result = await dependencies.service!.accept({
        jobId,
        actorUserId: authorized.actorUserId,
        expectedFingerprint: fingerprint,
        selectedRows: [...new Set(selectedRows as number[])],
        acceptKey,
      });
      if (result.status === 'not_found') return notFound();
      if (result.status === 'forbidden') {
        return new Response('Forbidden', {
          status: 403,
          headers: { 'Cache-Control': 'no-store' },
        });
      }
      if (result.status === 'stale') {
        return json({ code: 'stale_generation', message: result.message }, { status: 409 });
      }
      if (result.status === 'conflict') {
        return json({ code: 'conflict', message: result.message }, { status: 409 });
      }
      return json({
        status: 'accepted',
        job: result.job,
        created: result.created,
        skipped: result.skipped,
        packId: result.packId,
      });
    } catch {
      return json({ code: 'accept_failed' }, { status: 503 });
    }
  };
}
