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

const call = (body: unknown) =>
  PATCH(
    new Request('http://x/api/learner/profile/update', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  state.subject = 'user-1';
  state.queries = [];
  process.env.DATABASE_URL = 'postgres://x';
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
