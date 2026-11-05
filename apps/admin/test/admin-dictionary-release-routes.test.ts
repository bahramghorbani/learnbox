import { describe, expect, it, vi } from 'vitest';
import {
  createDictionaryFeedbackRoute,
  createDictionaryEditorialDraftMissingWordsRoute,
  createDictionaryEditorialReviewReportsRoute,
  createDictionaryReleaseActionRoute,
  createDictionaryReleaseStatusRoute,
} from '../lib/server/admin-dictionary-release-routes.js';
import { hashAdminSecret } from '../lib/server/admin-session.js';

const config = {
  enabled: true as const,
  origin: 'https://admin.learnbox.app',
  rpId: 'admin.learnbox.app',
  tokenHashKey: 'k'.repeat(32),
};
const now = new Date('2026-11-05T12:00:00Z');
const actor = '71b5b438-99c7-4a2e-a09a-859f7c9f95cb';
const token = 't'.repeat(43);
const csrf = 'c'.repeat(43);
const record = {
  file: 'dict-20261105T120000Z.sqlite',
  sha256: 'a'.repeat(64),
  builtAt: now.toISOString(),
  at: now.toISOString(),
  entries: 22006,
  added: 56,
  changed: 0,
  deleted: 0,
  actor,
  kind: 'publish' as const,
};
const report = { ...record, baseEntries: 21950, skipped: [], checks: [], ok: true, bytes: 1 };
function sessionStore(recent = true) {
  return {
    findActiveSession: async () => ({
      userId: actor,
      csrfHash: hashAdminSecret(csrf, config.tokenHashKey),
      lastSeenAt: now,
      absoluteExpiresAt: new Date(now.getTime() + 60000),
      revokedAt: null,
      recentAuthenticatedAt: recent ? now : new Date(now.getTime() - 360000),
    }),
    touchSession: async () => true,
  };
}
const post = (body: unknown, extra: HeadersInit = {}) =>
  new Request('https://admin.learnbox.app/api/dictionary/release', {
    method: 'POST',
    headers: {
      origin: config.origin,
      'content-type': 'application/json',
      cookie: `__Host-learnbox_admin_session=${token}`,
      'x-learnbox-csrf-token': csrf,
      ...extra,
    },
    body: JSON.stringify(body),
  });
const get = () =>
  new Request('https://admin.learnbox.app/api/dictionary/release', {
    headers: { cookie: `__Host-learnbox_admin_session=${token}` },
  });
function deps(over: Record<string, unknown> = {}) {
  const store = {
    releaseRows: vi.fn(async () => ({ status: 'ok' as const, rows: [] })),
    changedSince: vi.fn(async () => ({ status: 'ok' as const, changed: 3 })),
    recordRelease: vi.fn(async () => undefined),
    create: vi.fn(async () => ({ status: 'applied' as const, item: {} }) as never),
    entriesByKeys: vi.fn(async () => ({ status: 'ok' as const, items: [] })),
    update: vi.fn(async () => ({ status: 'applied' as const, item: {} }) as never),
  };
  const publisher = {
    state: vi.fn(() => ({ current: record, history: [record] })),
    publish: vi.fn(() => ({ status: 'published' as const, report })),
    knownWords: vi.fn((words: string[]) => new Set(words.filter((w) => w === 'Haus'))),
    rollback: vi.fn(() => ({
      status: 'rolled-back' as const,
      record: { ...record, kind: 'rollback' as const },
    })),
  };
  return {
    store,
    publisher,
    deps: {
      enabled: true,
      config,
      now: () => now,
      sessionStore: sessionStore(),
      store,
      publisher,
      ...over,
    },
  };
}

describe('dictionary release routes', () => {
  it('reports the live release and unpublished changes since it went live', async () => {
    const d = deps();
    const response = await createDictionaryReleaseStatusRoute(d.deps)(get());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ current: { file: record.file }, pending: 3 });
    expect(d.store.changedSince).toHaveBeenCalledWith(actor, record.at);
  });

  it('is a 404 when publishing is not configured', async () => {
    const d = deps({ publisher: undefined });
    expect((await createDictionaryReleaseStatusRoute(d.deps)(get())).status).toBe(404);
    expect(
      (await createDictionaryReleaseActionRoute(d.deps)(post({ action: 'publish' }))).status,
    ).toBe(404);
  });

  it('publishes and audits; refuses without CSRF or a recent sign-in', async () => {
    const d = deps();
    const route = createDictionaryReleaseActionRoute(d.deps);
    const ok = await route(post({ action: 'publish' }));
    expect(ok.status).toBe(200);
    expect(d.store.recordRelease).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ action: 'publish', file: record.file }),
    );
    expect(
      (await route(post({ action: 'publish' }, { 'x-learnbox-csrf-token': 'x'.repeat(43) })))
        .status,
    ).toBe(403);
    const stale = createDictionaryReleaseActionRoute({
      ...d.deps,
      sessionStore: sessionStore(false),
    });
    expect((await stale(post({ action: 'publish' }))).status).toBe(428);
    expect((await route(post({ action: 'drop' }))).status).toBe(400);
    expect(d.publisher.publish).toHaveBeenCalledTimes(1);
  });

  it('returns failed checks without auditing, and maps busy / nothing to roll back', async () => {
    const d = deps();
    d.publisher.publish.mockReturnValueOnce({
      status: 'failed',
      report: { ...report, ok: false },
    } as never);
    const route = createDictionaryReleaseActionRoute(d.deps);
    expect((await route(post({ action: 'publish' }))).status).toBe(422);
    expect(d.store.recordRelease).not.toHaveBeenCalled();
    d.publisher.publish.mockReturnValueOnce({ status: 'busy' } as never);
    expect((await route(post({ action: 'publish' }))).status).toBe(409);
    d.publisher.rollback.mockReturnValueOnce({ status: 'none' } as never);
    expect((await route(post({ action: 'rollback' }))).status).toBe(409);
    expect((await route(post({ action: 'rollback' }))).status).toBe(200);
    expect(d.store.recordRelease).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ action: 'rollback' }),
    );
  });

  it('serves visitor feedback to the super admin only, and is a 404 when not configured', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'fb-route-'));
    writeFileSync(
      join(dir, 'feedback.jsonl'),
      '{"type":"miss","q":"Haus","at":"a"}\n{"type":"miss","q":"Igel","at":"a"}\n',
    );
    const d = deps({ feedbackDir: dir });
    const ok = await createDictionaryFeedbackRoute(d.deps)(get());
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ misses: [{ q: 'Igel', count: 1 }], missTotal: 2 });
    const anon = new Request('https://admin.learnbox.app/api/dictionary/feedback');
    expect((await createDictionaryFeedbackRoute(d.deps)(anon)).status).toBe(401);
    expect((await createDictionaryFeedbackRoute(deps().deps)(get())).status).toBe(404);
  });

  it('is unreachable when the AI provider is not configured', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'fb-route-'));
    writeFileSync(join(dir, 'feedback.jsonl'), '{"type":"miss","q":"Igel","at":"a"}\n');
    const d = deps({ feedbackDir: dir, aiProvider: undefined });
    expect((await createDictionaryEditorialDraftMissingWordsRoute(d.deps)(post({}))).status).toBe(
      503,
    );
  });

  it('rejects a batch bigger than 20 words', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'fb-route-'));
    writeFileSync(join(dir, 'feedback.jsonl'), '{"type":"miss","q":"Igel","at":"a"}\n');
    const d = deps({
      feedbackDir: dir,
      aiProvider: { provider: 'test', model: 'm', complete: vi.fn(), listTextModels: vi.fn() },
    });
    const route = createDictionaryEditorialDraftMissingWordsRoute(d.deps);
    expect((await route(post({ maxWords: 21 }))).status).toBe(400);
  });

  it('writes a full entry only when the second reviewer approves it', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'fb-route-'));
    writeFileSync(join(dir, 'feedback.jsonl'), '{"type":"miss","q":"igel","at":"a"}\n');
    let call = 0;
    const replies = [
      JSON.stringify([
        {
          i: 1,
          skip: false,
          lemma: 'Igel',
          article: 'der',
          pos: 'noun',
          freq: 20,
          senses: [{ fa: 'جوجه‌تیغی', hint: '' }],
          examples: [{ de: 'Der Igel schläft.', fa: 'جوجه‌تیغی خواب است.' }],
        },
      ]),
      JSON.stringify([{ i: 1, approve: true }]),
    ];
    const store = {
      ...deps().store,
      create: vi.fn(async () => ({ status: 'applied' as const, item: {} }) as never),
    };
    const d = deps({
      feedbackDir: dir,
      store,
      aiProvider: {
        provider: 'test',
        model: 'm',
        complete: vi.fn(async () => replies[call++] ?? '[]'),
        listTextModels: vi.fn(),
      },
    });
    const route = createDictionaryEditorialDraftMissingWordsRoute(d.deps);
    const response = await route(post({ maxWords: 10 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      added: 1,
      words: [{ q: 'igel', status: 'applied' }],
    });
    expect(store.create).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        dictionaryKey: 'Igel',
        source: 'ai-pilot-3/miss',
        status: 'queued',
      }),
    );
  });

  it('writes nothing when the second reviewer rejects the proposal', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'fb-route-'));
    writeFileSync(join(dir, 'feedback.jsonl'), '{"type":"miss","q":"igel","at":"a"}\n');
    let call = 0;
    const replies = [
      JSON.stringify([
        {
          i: 1,
          skip: false,
          lemma: 'Igel',
          article: 'der',
          pos: 'noun',
          freq: 20,
          senses: [{ fa: 'جوجه‌تیغی', hint: '' }],
          examples: [{ de: 'Der Igel schläft.', fa: 'جوجه‌تیغی خواب است.' }],
        },
      ]),
      JSON.stringify([{ i: 1, approve: false }]),
    ];
    const store = { ...deps().store, create: vi.fn() };
    const d = deps({
      feedbackDir: dir,
      store,
      aiProvider: {
        provider: 'test',
        model: 'm',
        complete: vi.fn(async () => replies[call++] ?? '[]'),
        listTextModels: vi.fn(),
      },
    });
    const route = createDictionaryEditorialDraftMissingWordsRoute(d.deps);
    const response = await route(post({ maxWords: 10 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ added: 0, words: [] });
    expect(store.create).not.toHaveBeenCalled();
  });
});

describe('dictionary editorial review-reports route', () => {
  it('is unreachable when the AI provider is not configured', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'fb-route-'));
    writeFileSync(
      join(dir, 'feedback.jsonl'),
      '{"type":"report","lemma":"Bank","kind":"wrong","note":"n","at":"a"}\n',
    );
    const d = deps({ feedbackDir: dir, aiProvider: undefined });
    const route = createDictionaryEditorialReviewReportsRoute(d.deps);
    expect((await route(post({}))).status).toBe(503);
  });

  it('writes a fix only when the second reviewer approves it', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'fb-route-'));
    writeFileSync(
      join(dir, 'feedback.jsonl'),
      '{"type":"report","lemma":"Bank","kind":"wrong","note":"فقط نیمکت درست است","at":"a"}\n',
    );
    let call = 0;
    const replies = [
      JSON.stringify([
        {
          i: 1,
          valid: true,
          senses: [{ fa: 'نیمکت', hint: '' }],
          examples: [{ de: 'Die Bank ist neu.', fa: 'نیمکت نو است.' }],
        },
      ]),
      JSON.stringify([{ i: 1, approve: true }]),
    ];
    const entry = {
      id: 'e1b5b438-99c7-4a2e-a09a-859f7c9f95cc',
      dictionaryKey: 'Bank',
      revision: 2,
      payload: { lemma: 'Bank', senses: [{ fa: 'بانک', hint: '' }] },
    };
    const store = {
      ...deps().store,
      entriesByKeys: vi.fn(async () => ({ status: 'ok' as const, items: [entry] })),
      update: vi.fn(async () => ({ status: 'applied' as const, item: {} }) as never),
    };
    const d = deps({
      feedbackDir: dir,
      store,
      aiProvider: {
        provider: 'test',
        model: 'm',
        complete: vi.fn(async () => replies[call++] ?? '[]'),
        listTextModels: vi.fn(),
      },
    });
    const route = createDictionaryEditorialReviewReportsRoute(d.deps);
    const response = await route(post({ maxWords: 10 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      added: 1,
      words: [{ lemma: 'Bank', status: 'applied' }],
    });
    expect(store.update).toHaveBeenCalledWith(
      actor,
      entry.id,
      expect.objectContaining({ revision: 2, status: 'queued' }),
    );
  });

  it('writes nothing when the second reviewer rejects the fix', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'fb-route-'));
    writeFileSync(
      join(dir, 'feedback.jsonl'),
      '{"type":"report","lemma":"Bank","kind":"wrong","note":"n","at":"a"}\n',
    );
    let call = 0;
    const replies = [
      JSON.stringify([{ i: 1, valid: true, senses: [{ fa: 'نیمکت', hint: '' }], examples: [] }]),
      JSON.stringify([{ i: 1, approve: false }]),
    ];
    const entry = {
      id: 'e1b5b438-99c7-4a2e-a09a-859f7c9f95cc',
      dictionaryKey: 'Bank',
      revision: 2,
      payload: { lemma: 'Bank', senses: [{ fa: 'بانک', hint: '' }] },
    };
    const store = {
      ...deps().store,
      entriesByKeys: vi.fn(async () => ({ status: 'ok' as const, items: [entry] })),
      update: vi.fn(),
    };
    const d = deps({
      feedbackDir: dir,
      store,
      aiProvider: {
        provider: 'test',
        model: 'm',
        complete: vi.fn(async () => replies[call++] ?? '[]'),
        listTextModels: vi.fn(),
      },
    });
    const route = createDictionaryEditorialReviewReportsRoute(d.deps);
    const response = await route(post({ maxWords: 10 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ added: 0, words: [] });
    expect(store.update).not.toHaveBeenCalled();
  });
});
