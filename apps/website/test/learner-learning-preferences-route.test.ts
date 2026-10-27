import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  subject: 'user-1' as string | null,
  allowance: 7,
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
      if (text.startsWith('UPDATE')) state.allowance = values[0] as number;
      return { rows: state.subject ? [{ daily_new_card_allowance: state.allowance }] : [] };
    }
    async end() {}
  },
}));

import { PATCH } from '../app/api/learner/learning-preferences/route';
import { GET } from '../app/api/learner/learning-preferences/details/route';

const ORIGIN = 'https://app.learnboxapp.com';
const patch = (body: unknown, origin = ORIGIN) =>
  PATCH(
    new Request(`${ORIGIN}/api/learner/learning-preferences`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  state.subject = 'user-1';
  state.allowance = 7;
  state.queries = [];
  process.env.DATABASE_URL = 'postgres://x';
  process.env.LEARNBOX_PUBLIC_APP_ORIGIN = ORIGIN;
});

describe('learner daily new-card preference route', () => {
  it('returns the server-backed preference privately', async () => {
    state.allowance = 12;
    const response = await GET(new Request(`${ORIGIN}/api/learner/learning-preferences`));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ dailyNewCardAllowance: 12 });
  });

  it.each([3, 7, 12])('accepts the allowed ceiling %i', async (dailyNewCardAllowance) => {
    const response = await patch({ dailyNewCardAllowance });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ dailyNewCardAllowance });
    expect(state.queries[0].values).toEqual([dailyNewCardAllowance, 'user-1']);
  });

  it('rejects invalid or surplus input without a write', async () => {
    for (const body of [
      {},
      { dailyNewCardAllowance: 4 },
      { dailyNewCardAllowance: '7' },
      { dailyNewCardAllowance: 7, role: 'admin' },
    ]) {
      expect((await patch(body)).status).toBe(400);
    }
    expect(state.queries).toHaveLength(0);
  });

  it('guards the mutation before session or database work', async () => {
    const response = await patch({ dailyNewCardAllowance: 12 }, 'https://evil.example');
    expect(response.status).toBe(403);
    expect(state.queries).toHaveLength(0);
  });

  it('requires a learner session', async () => {
    state.subject = null;
    expect((await patch({ dailyNewCardAllowance: 3 })).status).toBe(401);
    expect(state.queries).toHaveLength(0);
  });
});
