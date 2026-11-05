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
      return { rows: [] };
    }
    async end() {}
  },
}));

import { DELETE } from '../app/api/learner/saved-words/remove/route';

const ORIGIN = 'https://app.learnboxapp.com';
const jsonHeaders = { 'content-type': 'application/json', origin: ORIGIN };
const del = (lemma: string) =>
  DELETE(
    new Request(`${ORIGIN}?lemma=${encodeURIComponent(lemma)}`, {
      method: 'DELETE',
      headers: jsonHeaders,
    }),
  );

beforeEach(() => {
  state.subject = 'user-1';
  state.queries = [];
  process.env.DATABASE_URL = 'postgres://x';
  process.env.LEARNBOX_PUBLIC_APP_ORIGIN = ORIGIN;
});

describe('learner saved-words remove route', () => {
  it('rejects a mutation from an untrusted origin', async () => {
    const response = await DELETE(
      new Request(`${ORIGIN}?lemma=Haus`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      }),
    );
    expect(response.status).toBe(403);
    expect(state.queries).toHaveLength(0);
  });

  it('requires a learner session', async () => {
    state.subject = null;
    expect((await del('Haus')).status).toBe(401);
    expect(state.queries).toHaveLength(0);
  });

  it('removes a word', async () => {
    const response = await del('Haus');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ removed: true });
    expect(state.queries[0].values).toEqual(['user-1', 'Haus']);
  });

  it('rejects a delete without a valid lemma', async () => {
    const response = await del('');
    expect(response.status).toBe(400);
    expect(state.queries).toHaveLength(0);
  });
});
