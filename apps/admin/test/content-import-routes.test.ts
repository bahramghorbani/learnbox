import { describe, expect, it, vi } from 'vitest';

import {
  createContentImportConfirmRoute,
  createContentImportContractRoute,
  createContentImportPreviewRoute,
  createContentImportTemplateRoute,
} from '../lib/server/admin-content-import-routes';
import { hashAdminSecret } from '../lib/server/admin-session.js';
import { IMPORT_COLUMNS } from '../lib/server/content-import-contract';

/**
 * Phase 1 / Milestone 1.3 — import route security boundary.
 *
 * These tests pin the guarantees that must never regress: an unauthenticated, cross-origin or
 * stale-reauth caller can never preview or import canonical content, preview never writes, and a
 * confirm that does not match the previewed fingerprint is refused.
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
const importKey = '11111111-1111-4111-8111-111111111111';

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

const analysis = {
  packId: 'learnbox-start',
  filename: 'x.csv',
  fileKind: 'csv' as const,
  totalRows: 1,
  counts: { new: 1, duplicate_in_file: 0, existing: 0, invalid: 0 },
  rows: [],
  unknownHeaders: [],
  missingRequiredColumns: [],
  importableFingerprint: 'a'.repeat(64),
  importableCount: 1,
};

function service(overrides: Partial<Record<'analyze' | 'apply', unknown>> = {}) {
  return {
    analyze: vi.fn(async () => ({ status: 'ok', analysis })),
    apply: vi.fn(async () => ({ status: 'applied', created: 1, skipped: 0, outcomes: [] })),
    ...overrides,
  } as never;
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

function upload(
  options: {
    origin?: string | null;
    cookie?: boolean;
    csrf?: boolean;
    fields?: Record<string, string>;
    file?: boolean;
  } = {},
) {
  const form = new FormData();
  form.set('packId', 'learnbox-start');
  if (options.file !== false) {
    form.set('file', new Blob([Buffer.from('a,b\n1,2\n')], { type: 'text/csv' }), 'x.csv');
  }
  for (const [key, value] of Object.entries(options.fields ?? {})) form.set(key, value);

  const headers = new Headers();
  if (options.origin !== null) headers.set('origin', options.origin ?? config.origin);
  if (options.cookie !== false)
    headers.set('cookie', `__Host-learnbox_admin_session=${sessionToken}`);
  if (options.csrf !== false) headers.set('x-learnbox-csrf-token', csrfToken);
  return new Request('https://admin.learnbox.app/api/content/import/preview', {
    method: 'POST',
    headers,
    body: form,
  });
}

describe('M1.3 import preview route', () => {
  it('404s when the manage gate is off', async () => {
    const route = createContentImportPreviewRoute(deps({ enabled: false }));
    expect((await route(upload())).status).toBe(404);
  });

  it('rejects a cross-origin upload before reading the session', async () => {
    const store = sessionStore();
    const spy = vi.spyOn(store, 'findActiveSession');
    const route = createContentImportPreviewRoute(deps({ sessionStore: store }));
    const response = await route(upload({ origin: 'https://evil.example' }));
    expect(response.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated upload with 401', async () => {
    const route = createContentImportPreviewRoute(
      deps({ sessionStore: sessionStore({ userId: null }) }),
    );
    expect((await route(upload())).status).toBe(401);
  });

  it('rejects a missing or wrong CSRF token with 400', async () => {
    const route = createContentImportPreviewRoute(deps());
    expect((await route(upload({ csrf: false }))).status).toBe(400);
  });

  it('demands fresh reauthentication with 428', async () => {
    const route = createContentImportPreviewRoute(
      deps({ sessionStore: sessionStore({ recent: false }) }),
    );
    const response = await route(upload());
    expect(response.status).toBe(428);
    expect(await response.json()).toEqual({ code: 'reauthentication_required' });
  });

  it('rejects a request with no file', async () => {
    const route = createContentImportPreviewRoute(deps());
    expect((await route(upload({ file: false }))).status).toBe(400);
  });

  it('returns the analysis and never writes', async () => {
    const importService = service();
    const route = createContentImportPreviewRoute(deps({ service: importService }));
    const response = await route(upload());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'preview', analysis });
    expect(response.headers.get('cache-control')).toBe('no-store');
    // The preview route has no access to apply() at all in this call.
    expect(
      (importService as unknown as { apply: ReturnType<typeof vi.fn> }).apply,
    ).not.toHaveBeenCalled();
  });

  it('reports an unreadable file as 422 with a correctable message', async () => {
    const route = createContentImportPreviewRoute(
      deps({
        service: service({
          analyze: vi.fn(async () => ({ status: 'unreadable', message: 'فایل خالی است.' })),
        }),
      }),
    );
    const response = await route(upload());
    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe('unreadable_file');
  });

  it('404s for an unknown pack', async () => {
    const route = createContentImportPreviewRoute(
      deps({ service: service({ analyze: vi.fn(async () => ({ status: 'not_found' })) }) }),
    );
    expect((await route(upload())).status).toBe(404);
  });

  it('returns 503 when analysis throws, without leaking detail', async () => {
    const route = createContentImportPreviewRoute(
      deps({
        service: service({
          analyze: vi.fn(async () => {
            throw new Error('connection terminated: secret-host:5432');
          }),
        }),
      }),
    );
    const response = await route(upload());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('secret-host');
  });
});

describe('M1.3 import confirm route', () => {
  const fields = { fingerprint: 'a'.repeat(64), importKey };

  it('applies a confirmed import and reports the result', async () => {
    const importService = service();
    const route = createContentImportConfirmRoute(deps({ service: importService }));
    const response = await route(upload({ fields }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'applied',
      created: 1,
      skipped: 0,
      outcomes: [],
    });
  });

  it('refuses a confirm with no fingerprint — the owner must have previewed', async () => {
    const importService = service();
    const route = createContentImportConfirmRoute(deps({ service: importService }));
    const response = await route(upload({ fields: { importKey } }));
    expect(response.status).toBe(400);
    expect(
      (importService as unknown as { apply: ReturnType<typeof vi.fn> }).apply,
    ).not.toHaveBeenCalled();
  });

  it('refuses a confirm with a non-uuid import key', async () => {
    const route = createContentImportConfirmRoute(deps());
    const response = await route(
      upload({ fields: { fingerprint: 'a'.repeat(64), importKey: 'not-a-uuid' } }),
    );
    expect(response.status).toBe(400);
  });

  it('returns 409 when the preview is stale', async () => {
    const route = createContentImportConfirmRoute(
      deps({
        service: service({
          apply: vi.fn(async () => ({ status: 'stale', message: 'تغییر کرده است.' })),
        }),
      }),
    );
    const response = await route(upload({ fields }));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('stale_preview');
  });

  it('returns 403 when the actor lacks the editorial role', async () => {
    const route = createContentImportConfirmRoute(
      deps({ service: service({ apply: vi.fn(async () => ({ status: 'forbidden' })) }) }),
    );
    expect((await route(upload({ fields }))).status).toBe(403);
  });

  it('still enforces the full guard chain', async () => {
    const route = createContentImportConfirmRoute(deps());
    expect((await route(upload({ fields, origin: 'https://evil.example' }))).status).toBe(400);
    expect((await route(upload({ fields, csrf: false }))).status).toBe(400);

    const unauth = createContentImportConfirmRoute(
      deps({ sessionStore: sessionStore({ userId: null }) }),
    );
    expect((await unauth(upload({ fields }))).status).toBe(401);
  });
});

describe('M1.3 template and contract routes', () => {
  function get(options: { cookie?: boolean; url?: string } = {}) {
    const headers = new Headers();
    if (options.cookie !== false)
      headers.set('cookie', `__Host-learnbox_admin_session=${sessionToken}`);
    return new Request(options.url ?? 'https://admin.learnbox.app/api/content/import/template', {
      headers,
    });
  }

  it('serves the template only to an authenticated Admin', async () => {
    const route = createContentImportTemplateRoute(deps());
    expect((await route(get({ cookie: false }))).status).toBe(401);

    const response = await route(get());
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('content-disposition')).toContain('learnbox-import-template.csv');
    const body = await response.text();
    expect(body).toContain('واژهٔ آلمانی *');
  });

  it('includes an example row only when asked', async () => {
    const route = createContentImportTemplateRoute(deps());
    const blank = await (
      await route(get({ url: 'https://admin.learnbox.app/api/content/import/template' }))
    ).text();
    expect(blank.trim().split('\n')).toHaveLength(1);

    const withExample = await (
      await route(get({ url: 'https://admin.learnbox.app/api/content/import/template?example=1' }))
    ).text();
    expect(withExample.trim().split('\n')).toHaveLength(2);
    expect(withExample).toContain('Tisch');
  });

  it('serves the column contract so the UI documents one source of truth', async () => {
    const route = createContentImportContractRoute(deps());
    expect((await route(get({ cookie: false }))).status).toBe(401);
    const response = await route(get());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { columns: Array<{ key: string }> };
    expect(body.columns).toHaveLength(IMPORT_COLUMNS.length);
    expect(body.columns[0]!.key).toBe('lemma');
  });

  it('404s when the gate is off', async () => {
    const route = createContentImportTemplateRoute(deps({ enabled: false }));
    expect((await route(get())).status).toBe(404);
  });
});
