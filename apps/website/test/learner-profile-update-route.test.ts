import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  subject: 'user-1' as string | null,
  queries: [] as Array<{ text: string; values: unknown[] }>,
}));

vi.mock('../lib/learner-auth', () => ({
  authenticateLearner: async () => (state.subject ? { subject: state.subject } : null),
}));
vi.mock('../../api/dist/database/migration-runner.js', () => ({
  requireVerifiedDatabaseTls: (url: string) => url,
}));
vi.mock('pg', () => ({
  Pool: class {
    async query(text: string, values: unknown[]) {
      state.queries.push({ text, values });
      return {
        rows: [
          {
            first_name: 'سارا',
            last_name: null,
            date_of_birth: null,
            gender: 'female',
            avatar_id: null,
          },
        ],
      };
    }
    async end() {}
  },
}));

import { PATCH } from '../app/api/learner/profile/update/route';

const ORIGIN = 'https://app.learnboxapp.com';

const call = (body: unknown) =>
  PATCH(
    new Request(`${ORIGIN}/api/learner/profile/update`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  state.subject = 'user-1';
  state.queries = [];
  process.env.DATABASE_URL = 'postgres://x';
  process.env.LEARNBOX_PUBLIC_APP_ORIGIN = ORIGIN;
});

describe('PATCH /api/learner/profile/update (LB-B28a wiring)', () => {
  it('rejects unauthenticated requests before touching the database', async () => {
    state.subject = null;
    const response = await call({ gender: 'male' });
    expect(response.status).toBe(401);
    expect(state.queries).toHaveLength(0);
  });

  it('the panel payload (all five fields) is accepted and returns the saved profile', async () => {
    const response = await call({
      firstName: 'سارا',
      lastName: null,
      dateOfBirth: null,
      gender: 'female',
      avatarId: 'bobo-focus',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.profile.gender).toBe('female');
    expect(state.queries[0].text).toMatch(/^UPDATE users SET/);
    expect(state.queries[0].values.at(-1)).toBe('user-1');
  });

  it('keeps the legacy onboarding contract: {firstName} only, non-empty, echoed back', async () => {
    const ok = await call({ firstName: 'علی' });
    expect(ok.status).toBe(200);
    expect((await ok.json()).firstName).toBe('سارا'); // echoed from the saved row
    state.queries = [];
    const blank = await call({ firstName: '   ' });
    expect(blank.status).toBe(400);
    expect((await blank.json()).error).toBe('invalid_name');
    expect(state.queries).toHaveLength(0);
  });

  it('refuses phone/identity/unknown fields and invalid values with 400, no write', async () => {
    for (const body of [
      { phone: '+491****9999' },
      { firstName: 'a', id: 'x' },
      { gender: 'nope' },
      { avatarId: 'https://evil.example/a.png' },
      { dateOfBirth: '2999-01-01' },
      {},
    ]) {
      const response = await call(body);
      expect(response.status).toBe(400);
    }
    expect(state.queries).toHaveLength(0);
  });
});

describe('PATCH /api/learner/profile/update — mutation guard (LB-B29)', () => {
  const send = (init: { origin?: string | null; contentType?: string | null; method?: string }) => {
    const headers = new Headers();
    if (init.origin !== null) headers.set('origin', init.origin ?? ORIGIN);
    if (init.contentType !== null)
      headers.set('content-type', init.contentType ?? 'application/json');
    return PATCH(
      new Request(`${ORIGIN}/api/learner/profile/update`, {
        method: init.method ?? 'PATCH',
        headers,
        body: JSON.stringify({ avatarId: 'bobo-focus' }),
      }),
    );
  };

  it('rejects a foreign Origin with a valid session: 403, no write', async () => {
    const response = await send({ origin: 'https://evil.example' });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'request_rejected' });
    expect(state.queries).toHaveLength(0);
  });

  it('rejects a missing Origin and a non-JSON content type: 403, no write', async () => {
    expect((await send({ origin: null })).status).toBe(403);
    for (const contentType of ['text/plain', 'application/x-www-form-urlencoded', null]) {
      expect((await send({ contentType })).status).toBe(403);
    }
    expect(state.queries).toHaveLength(0);
  });

  it('does not accept the wrong method through this handler', async () => {
    expect((await send({ method: 'POST' })).status).toBe(403);
    expect(state.queries).toHaveLength(0);
  });

  it('decides before authentication: a foreign origin cannot probe for a session', async () => {
    state.subject = null;
    const foreign = await send({ origin: 'https://evil.example' });
    expect(foreign.status).toBe(403);
    // ...whereas a same-origin unauthenticated request is still a plain 401.
    const same = await send({});
    expect(same.status).toBe(401);
    expect(state.queries).toHaveLength(0);
  });
});
