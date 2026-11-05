import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  subject: 'user-1' as string | null,
  queries: [] as Array<{ text: string; values: unknown[] }>,
  lemmas: ['Haus'] as string[],
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
      if (text.startsWith('SELECT')) return { rows: state.lemmas.map((lemma) => ({ lemma })) };
      return { rows: [] };
    }
    async end() {}
  },
}));

import { GET, POST } from '../app/api/learner/saved-words/route';

const ORIGIN = 'https://app.learnboxapp.com';
const jsonHeaders = { 'content-type': 'application/json', origin: ORIGIN };
const post = (body: unknown) =>
  POST(new Request(ORIGIN, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) }));

beforeEach(() => {
  state.subject = 'user-1';
  state.queries = [];
  state.lemmas = ['Haus'];
  process.env.DATABASE_URL = 'postgres://x';
  process.env.LEARNBOX_PUBLIC_APP_ORIGIN = ORIGIN;
});

describe('learner saved-words route', () => {
  it('rejects a mutation from an untrusted origin before touching the database', async () => {
    expect(
      (
        await POST(
          new Request(ORIGIN, {
            method: 'POST',
            headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
            body: JSON.stringify({ lemma: 'Haus' }),
          }),
        )
      ).status,
    ).toBe(403);
    expect(state.queries).toHaveLength(0);
  });

  it('requires a learner session on every method', async () => {
    state.subject = null;
    expect((await GET(new Request(ORIGIN))).status).toBe(401);
    expect((await post({ lemma: 'Haus' })).status).toBe(401);
    expect(state.queries).toHaveLength(0);
  });

  it('lists the saved lemmas', async () => {
    state.lemmas = ['Haus'];
    const response = await GET(new Request(ORIGIN));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ lemmas: ['Haus'] });
  });

  it('saves a single word', async () => {
    const response = await post({ lemma: 'Fenster' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ added: 1 });
    expect(state.queries[0].values).toEqual(['user-1', ['Fenster']]);
  });

  it('imports a bulk transfer, capped, skipping anything malformed', async () => {
    const response = await post({ lemmas: ['Haus', 'Haus', 'Tisch', '<script>', 42] });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ added: 3 });
    expect(state.queries[0].values).toEqual(['user-1', ['Haus', 'Haus', 'Tisch']]);
  });

  it('rejects an empty or fully-invalid request without a write', async () => {
    for (const body of [{}, { lemma: '' }, { lemma: 123 }, { lemmas: ['<script>'] }]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(state.queries).toHaveLength(0);
  });
});
