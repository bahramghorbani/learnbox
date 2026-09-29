import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  session: null as { sessionId: string; subject: string; issuedAt: number } | null,
  revoked: [] as string[],
  revokeFails: false,
  poolsOpened: 0,
}));

vi.mock('../lib/server-session', () => ({ readLearnerSession: () => state.session }));
vi.mock('../lib/session-revocation', () => ({
  revokeSession: async (_pool: unknown, session: { sessionId: string }) => {
    if (state.revokeFails) throw new Error('db down');
    state.revoked.push(session.sessionId);
  },
}));
vi.mock('../../api/dist/database/migration-runner.js', () => ({
  requireVerifiedDatabaseTls: (url: string) => url,
}));
vi.mock('pg', () => ({
  Pool: class {
    constructor() {
      state.poolsOpened += 1;
    }
    async end() {}
  },
}));

import { POST } from '../app/api/auth/logout/route';

const ORIGIN = 'https://app.learnboxapp.com';

function logout(
  init: { origin?: string | null; contentType?: string | null; method?: string } = {},
) {
  const headers = new Headers({ cookie: 'learnbox_alpha_session=v2.x.y' });
  if (init.origin !== null) headers.set('origin', init.origin ?? ORIGIN);
  if (init.contentType !== null)
    headers.set('content-type', init.contentType ?? 'application/json');
  return POST(
    new Request(`${ORIGIN}/api/auth/logout`, {
      method: init.method ?? 'POST',
      headers,
      body: '{}',
    }),
  );
}

beforeEach(() => {
  state.session = { sessionId: 'sess-1', subject: 'user-1', issuedAt: 1_800_000_000 };
  state.revoked = [];
  state.revokeFails = false;
  state.poolsOpened = 0;
  process.env.DATABASE_URL = 'postgres://x';
  process.env.LEARNBOX_PUBLIC_APP_ORIGIN = ORIGIN;
});

describe('POST /api/auth/logout — behaviour preserved (LB-B27)', () => {
  it('revokes the session server-side and clears the cookie on a same-origin request', async () => {
    const response = await logout();
    expect(response.status).toBe(204);
    expect(state.revoked).toEqual(['sess-1']);
    expect(response.headers.get('set-cookie')).toMatch(
      /learnbox_alpha_session=; .*Max-Age=0.*HttpOnly/,
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('stays idempotent: no valid session is still 204 and revokes nothing', async () => {
    state.session = null;
    const response = await logout();
    expect(response.status).toBe(204);
    expect(state.revoked).toEqual([]);
    expect(state.poolsOpened).toBe(0);
  });

  it('surfaces a revocation failure as 503 while still clearing the cookie', async () => {
    state.revokeFails = true;
    const response = await logout();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: 'revocation_failed' });
    expect(response.headers.get('set-cookie')).toMatch(/Max-Age=0/);
  });
});

describe('POST /api/auth/logout — mutation guard (LB-B29)', () => {
  it('a foreign Origin cannot sign the learner out: 403, nothing revoked, cookie untouched', async () => {
    const response = await logout({ origin: 'https://evil.example' });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'request_rejected' });
    expect(state.revoked).toEqual([]);
    expect(state.poolsOpened).toBe(0);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('rejects a missing Origin and every non-JSON content type the same way', async () => {
    for (const init of [
      { origin: null },
      { contentType: 'text/plain' },
      { contentType: 'application/x-www-form-urlencoded' },
      { contentType: null },
    ]) {
      const response = await logout(init);
      expect(response.status).toBe(403);
      expect(response.headers.get('set-cookie')).toBeNull();
    }
    expect(state.revoked).toEqual([]);
  });

  it('rejects other methods through the handler', async () => {
    expect((await logout({ method: 'PUT' })).status).toBe(403);
    expect(state.revoked).toEqual([]);
  });

  it('decides before reading the session: a foreign origin gets 403 with or without one', async () => {
    const withSession = await logout({ origin: 'https://evil.example' });
    state.session = null;
    const withoutSession = await logout({ origin: 'https://evil.example' });
    expect(withSession.status).toBe(403);
    expect(withoutSession.status).toBe(403);
  });
});
