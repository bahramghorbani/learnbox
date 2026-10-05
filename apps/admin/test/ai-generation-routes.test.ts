import { describe, expect, it, vi } from 'vitest';

import {
  createAiAcceptRoute,
  createAiApprovePlanRoute,
  createAiJobStatusRoute,
  createAiPlanRoute,
  createAiRunBatchRoute,
} from '../lib/server/admin-ai-generation-routes';
import { hashAdminSecret } from '../lib/server/admin-session.js';

/**
 * Phase 1 / Milestone 1.4 — AI generation route security boundary.
 *
 * The guarantee under test: the AI routes are never a public content-generation endpoint. An
 * unauthenticated, cross-origin, CSRF-less or stale-reauth caller must be refused BEFORE the
 * provider is reached, so LearnBox's credential can never be spent by an anonymous request.
 * A missing provider is reported honestly as 503 rather than answered with fabricated content.
 */

const config = {
  enabled: true as const,
  origin: 'https://admin.learnbox.app',
  rpId: 'admin.learnbox.app',
  tokenHashKey: 'k'.repeat(32),
};
const now = new Date('2026-10-05T10:30:00.000Z');
const sessionToken = 't'.repeat(43);
const csrfToken = 'c'.repeat(43);
const actorUserId = '22222222-2222-4222-8222-222222222222';
const jobId = '33333333-3333-4333-8333-333333333333';
const acceptKey = '11111111-1111-4111-8111-111111111111';
const fingerprint = 'a'.repeat(64);

function sessionStore(overrides: { userId?: string | null; recent?: boolean } = {}) {
  const recent = overrides.recent !== false;
  return {
    findActiveSession: async () =>
      overrides.userId === null
        ? undefined
        : {
            userId: overrides.userId ?? actorUserId,
            csrfHash: hashAdminSecret(csrfToken, config.tokenHashKey),
            lastSeenAt: now,
            absoluteExpiresAt: new Date(now.getTime() + 60_000),
            revokedAt: null,
            recentAuthenticatedAt: recent ? now : new Date(now.getTime() - 86_400_000),
          },
    touchSession: async () => true,
  };
}

const job = {
  jobId,
  status: 'planned' as const,
  prompt: 'بساز',
  plan: {
    packId: 'studium-b1',
    title: 'بسته',
    description: '',
    audience: '',
    cefr: 'B1',
    cardCount: 4,
    requestedCount: 4,
    topics: [],
    strategy: '',
    fields: [],
    scope: '',
  },
  planFingerprint: 'b'.repeat(64),
  progress: {
    requested: 4,
    generated: 0,
    batchSize: 2,
    batchesDone: 0,
    batchesTotal: 2,
    attemptsOnCurrentBatch: 0,
  },
};

const analysis = {
  packId: 'studium-b1',
  filename: 'studium-b1.ai',
  fileKind: 'csv' as const,
  totalRows: 1,
  counts: { new: 1, duplicate_in_file: 0, existing: 0, invalid: 0 },
  rows: [],
  unknownHeaders: [],
  missingRequiredColumns: [],
  importableFingerprint: fingerprint,
  importableCount: 1,
};

function service(overrides: Record<string, unknown> = {}) {
  return {
    plan: vi.fn<
      (input: { prompt: string; actorUserId: string; model?: string }) => Promise<unknown>
    >(async () => ({
      status: 'ok',
      job,
    })),
    approvePlan: vi.fn(async () => ({ status: 'ok', job })),
    runNextBatch: vi.fn(async () => ({ status: 'ok', job })),
    analyzeJob: vi.fn(async () => ({ status: 'ok', job, analysis })),
    accept: vi.fn<(input: { selectedRows: number[]; acceptKey: string }) => Promise<unknown>>(
      async () => ({
        status: 'ok',
        job,
        created: 1,
        skipped: 0,
        packId: 'studium-b1',
      }),
    ),
    ...overrides,
  };
}

function deps(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    config,
    sessionStore: sessionStore(),
    service: service(),
    now: () => now,
    ...overrides,
  } as never;
}

function post(
  body: unknown,
  options: { origin?: string | null; cookie?: boolean; csrf?: boolean } = {},
) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (options.origin !== null) headers.set('origin', options.origin ?? config.origin);
  if (options.cookie !== false)
    headers.set('cookie', `__Host-learnbox_admin_session=${sessionToken}`);
  if (options.csrf !== false) headers.set('x-learnbox-csrf-token', csrfToken);
  return new Request('https://admin.learnbox.app/api/content/ai/plan', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

const allRoutes = [
  ['plan', createAiPlanRoute, { prompt: 'بساز' }],
  ['approve', createAiApprovePlanRoute, { jobId, planFingerprint: 'b'.repeat(64) }],
  ['generate', createAiRunBatchRoute, { jobId }],
  ['status', createAiJobStatusRoute, { jobId }],
  ['accept', createAiAcceptRoute, { jobId, fingerprint, acceptKey, selectedRows: [1] }],
] as const;

describe('M1.4 AI route guard chain', () => {
  for (const [name, factory, body] of allRoutes) {
    describe(`${name} route`, () => {
      it('404s when the manage gate is off', async () => {
        const route = factory(deps({ enabled: false, config: { enabled: false } }));
        expect((await route(post(body))).status).toBe(404);
      });

      it('rejects a cross-origin request before reading the session', async () => {
        const store = sessionStore();
        const spy = vi.spyOn(store, 'findActiveSession');
        const route = factory(deps({ sessionStore: store }));
        const response = await route(post(body, { origin: 'https://evil.example' }));
        expect(response.status).toBe(400);
        expect(spy).not.toHaveBeenCalled();
      });

      it('rejects an unauthenticated request', async () => {
        const svc = service();
        const route = factory(deps({ sessionStore: sessionStore({ userId: null }), service: svc }));
        const response = await route(post(body));
        expect(response.status).toBe(401);
        // The provider is never reached by an anonymous caller.
        for (const spy of Object.values(svc)) expect(spy).not.toHaveBeenCalled();
      });

      it('rejects a request with no CSRF header', async () => {
        const svc = service();
        const route = factory(deps({ service: svc }));
        const response = await route(post(body, { csrf: false }));
        expect(response.status).toBe(400);
        for (const spy of Object.values(svc)) expect(spy).not.toHaveBeenCalled();
      });

      it('demands recent re-authentication', async () => {
        const svc = service();
        const route = factory(
          deps({ sessionStore: sessionStore({ recent: false }), service: svc }),
        );
        const response = await route(post(body));
        expect(response.status).toBe(428);
        for (const spy of Object.values(svc)) expect(spy).not.toHaveBeenCalled();
      });

      it('reports a disabled feature as 503 without fabricating content', async () => {
        const route = factory(deps({ enabled: false, service: undefined }));
        const response = await route(post(body));
        expect(response.status).toBe(503);
        const payload = (await response.json()) as { code: string; job?: unknown };
        expect(payload.code).toBe('disabled');
        expect(payload.job).toBeUndefined();
      });

      it('authenticates before revealing feature availability', async () => {
        const route = factory(
          deps({
            enabled: false,
            service: undefined,
            sessionStore: sessionStore({ userId: null }),
          }),
        );
        // 401, not 503: an anonymous caller learns nothing about the AI configuration.
        expect((await route(post(body))).status).toBe(401);
      });
    });
  }
});

describe('M1.4 provider-credential boundary', () => {
  it('answers 503 provider_not_configured on plan, with no fabricated plan', async () => {
    const route = createAiPlanRoute(
      deps({ service: service({ plan: async () => ({ status: 'provider_not_configured' }) }) }),
    );
    const response = await route(post({ prompt: 'بساز' }));
    expect(response.status).toBe(503);
    const payload = (await response.json()) as { code: string; job?: unknown };
    expect(payload.code).toBe('provider_not_configured');
    expect(payload.job).toBeUndefined();
  });

  it('answers 503 provider_not_configured on generate', async () => {
    const route = createAiRunBatchRoute(
      deps({
        service: service({ runNextBatch: async () => ({ status: 'provider_not_configured' }) }),
      }),
    );
    const response = await route(post({ jobId }));
    expect(response.status).toBe(503);
    expect(((await response.json()) as { code: string }).code).toBe('provider_not_configured');
  });

  it('still serves job inspection without a credential', async () => {
    // A rotated-away key must not strand content an Admin already generated and reviewed.
    const route = createAiJobStatusRoute(deps());
    expect((await route(post({ jobId }))).status).toBe(200);
  });

  it('still allows acceptance without a credential', async () => {
    const route = createAiAcceptRoute(deps());
    const response = await route(post({ jobId, fingerprint, acceptKey, selectedRows: [1] }));
    expect(response.status).toBe(200);
  });
});

describe('M1.4 plan route', () => {
  it('passes the prompt and the session actor to the service', async () => {
    const svc = service();
    const route = createAiPlanRoute(deps({ service: svc }));
    const response = await route(post({ prompt: 'یک بستهٔ B1 بساز' }));
    expect(response.status).toBe(200);
    expect(svc.plan).toHaveBeenCalledWith({
      prompt: 'یک بستهٔ B1 بساز',
      // The actor comes from the session, never from the request body.
      actorUserId,
    });
  });

  it('ignores an actor supplied in the body', async () => {
    const svc = service();
    const route = createAiPlanRoute(deps({ service: svc }));
    await route(post({ prompt: 'بساز', actorUserId: '99999999-9999-4999-8999-999999999999' }));
    expect(svc.plan.mock.calls[0]![0].actorUserId).toBe(actorUserId);
  });

  it('rejects a missing prompt', async () => {
    const route = createAiPlanRoute(deps());
    expect((await route(post({}))).status).toBe(400);
  });

  it('forwards an Admin-selected model to the service', async () => {
    const svc = service();
    const route = createAiPlanRoute(deps({ service: svc }));
    await route(post({ prompt: 'بساز', model: 'claude-haiku-4-5' }));
    expect(svc.plan.mock.calls[0]![0].model).toBe('claude-haiku-4-5');
  });

  it('forwards no model when the body omits one', async () => {
    const svc = service();
    const route = createAiPlanRoute(deps({ service: svc }));
    await route(post({ prompt: 'بساز' }));
    expect(svc.plan.mock.calls[0]![0].model).toBeUndefined();
  });

  it('does not fail the request when the model field is not a string', async () => {
    // A junk selection must degrade to the configured default, not break generation. The
    // service applies the allow-list; the route only declines to forward a non-string.
    const svc = service();
    const route = createAiPlanRoute(deps({ service: svc }));
    const response = await route(post({ prompt: 'بساز', model: { evil: true } }));
    expect(response.status).toBe(200);
    expect(svc.plan.mock.calls[0]![0].model).toBeUndefined();
  });

  it('surfaces an over-long prompt as 422', async () => {
    const route = createAiPlanRoute(
      deps({
        service: service({ plan: async () => ({ status: 'invalid', message: 'too long' }) }),
      }),
    );
    expect((await route(post({ prompt: 'x' }))).status).toBe(422);
  });

  it('surfaces a provider failure as 502', async () => {
    const route = createAiPlanRoute(
      deps({
        service: service({
          plan: async () => ({
            status: 'provider_error',
            code: 'provider_timeout',
            message: 'timed out',
          }),
        }),
      }),
    );
    const response = await route(post({ prompt: 'بساز' }));
    expect(response.status).toBe(502);
    expect(((await response.json()) as { code: string }).code).toBe('provider_timeout');
  });
});

describe('M1.4 plan approval route', () => {
  it('requires a well-formed plan fingerprint', async () => {
    const svc = service();
    const route = createAiApprovePlanRoute(deps({ service: svc }));
    expect((await route(post({ jobId, planFingerprint: 'short' }))).status).toBe(400);
    expect(svc.approvePlan).not.toHaveBeenCalled();
  });

  it('rejects a malformed job id', async () => {
    const route = createAiApprovePlanRoute(deps());
    expect((await route(post({ jobId: 'nope', planFingerprint: 'b'.repeat(64) }))).status).toBe(
      400,
    );
  });

  it('answers 409 when the plan drifted since review', async () => {
    const route = createAiApprovePlanRoute(
      deps({
        service: service({ approvePlan: async () => ({ status: 'stale', message: 'changed' }) }),
      }),
    );
    expect((await route(post({ jobId, planFingerprint: 'b'.repeat(64) }))).status).toBe(409);
  });
});

describe('M1.4 generate route', () => {
  it('answers 409 when another batch holds the lease', async () => {
    const route = createAiRunBatchRoute(
      deps({
        service: service({
          runNextBatch: async () => ({ status: 'conflict', message: 'in flight' }),
        }),
      }),
    );
    expect((await route(post({ jobId }))).status).toBe(409);
  });

  it('reports a failed job honestly instead of as success', async () => {
    const route = createAiRunBatchRoute(
      deps({
        service: service({
          runNextBatch: async () => ({
            status: 'failed',
            job: { ...job, status: 'failed', error: { code: 'provider_timeout', message: 'x' } },
          }),
        }),
      }),
    );
    const response = await route(post({ jobId }));
    const payload = (await response.json()) as { status: string };
    expect(payload.status).toBe('failed');
  });
});

describe('M1.4 accept route', () => {
  it('accepts an explicit selection and reports what was created', async () => {
    const svc = service();
    const route = createAiAcceptRoute(deps({ service: svc }));
    const response = await route(post({ jobId, fingerprint, acceptKey, selectedRows: [1, 2] }));
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { created: number; packId: string };
    expect(payload.created).toBe(1);
    expect(svc.accept).toHaveBeenCalledWith({
      jobId,
      actorUserId,
      expectedFingerprint: fingerprint,
      selectedRows: [1, 2],
      acceptKey,
    });
  });

  it('refuses an empty selection, so acceptance is always explicit', async () => {
    const svc = service();
    const route = createAiAcceptRoute(deps({ service: svc }));
    expect((await route(post({ jobId, fingerprint, acceptKey, selectedRows: [] }))).status).toBe(
      400,
    );
    expect(svc.accept).not.toHaveBeenCalled();
  });

  it('refuses a selection above the server ceiling', async () => {
    const svc = service();
    const route = createAiAcceptRoute(deps({ service: svc }));
    const selectedRows = Array.from({ length: 501 }, (_, index) => index + 1);
    expect((await route(post({ jobId, fingerprint, acceptKey, selectedRows }))).status).toBe(400);
    expect(svc.accept).not.toHaveBeenCalled();
  });

  it('refuses non-integer or non-positive row numbers', async () => {
    const svc = service();
    const route = createAiAcceptRoute(deps({ service: svc }));
    for (const selectedRows of [[0], [-1], [1.5], ['1'], [null]]) {
      expect((await route(post({ jobId, fingerprint, acceptKey, selectedRows }))).status).toBe(400);
    }
    expect(svc.accept).not.toHaveBeenCalled();
  });

  it('de-duplicates a repeated row number', async () => {
    const svc = service();
    const route = createAiAcceptRoute(deps({ service: svc }));
    await route(post({ jobId, fingerprint, acceptKey, selectedRows: [1, 1, 2] }));
    expect(svc.accept.mock.calls[0]![0].selectedRows).toEqual([1, 2]);
  });

  it('requires a well-formed accept key, so idempotency cannot be bypassed', async () => {
    const svc = service();
    const route = createAiAcceptRoute(deps({ service: svc }));
    expect(
      (await route(post({ jobId, fingerprint, acceptKey: 'nope', selectedRows: [1] }))).status,
    ).toBe(400);
    expect(svc.accept).not.toHaveBeenCalled();
  });

  it('answers 409 when the generated content drifted since review', async () => {
    const route = createAiAcceptRoute(
      deps({
        service: service({ accept: async () => ({ status: 'stale', message: 'changed' }) }),
      }),
    );
    expect((await route(post({ jobId, fingerprint, acceptKey, selectedRows: [1] }))).status).toBe(
      409,
    );
  });

  it('answers 403 when the actor may not write content', async () => {
    const route = createAiAcceptRoute(
      deps({ service: service({ accept: async () => ({ status: 'forbidden' }) }) }),
    );
    expect((await route(post({ jobId, fingerprint, acceptKey, selectedRows: [1] }))).status).toBe(
      403,
    );
  });
});

describe('M1.4 job status route', () => {
  it('returns the job and its canonical analysis', async () => {
    const route = createAiJobStatusRoute(deps());
    const response = await route(post({ jobId }));
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { analysis: { importableFingerprint: string } };
    expect(payload.analysis.importableFingerprint).toBe(fingerprint);
  });

  it('404s an unknown job', async () => {
    const route = createAiJobStatusRoute(
      deps({ service: service({ analyzeJob: async () => ({ status: 'not_found' }) }) }),
    );
    expect((await route(post({ jobId }))).status).toBe(404);
  });

  it('never caches a response', async () => {
    const route = createAiJobStatusRoute(deps());
    const response = await route(post({ jobId }));
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
