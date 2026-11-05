import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ subject: 'user-1' as string | null }));

vi.mock('../lib/learner-auth', () => ({
  authenticateLearner: async () => (state.subject ? { subject: state.subject } : null),
}));

import { GET } from '../app/api/learner/dictionary/search/route';

const ORIGIN = 'https://app.learnboxapp.com';

beforeEach(() => {
  state.subject = 'user-1';
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('learner dictionary-search proxy route', () => {
  it('requires a learner session', async () => {
    state.subject = null;
    const response = await GET(new Request(`${ORIGIN}?q=Haus`));
    expect(response.status).toBe(401);
  });

  it('forwards a query to the public dictionary site and returns its hits', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      expect(String(url)).toBe('https://learnboxapp.com/dictionary/search?q=Haus');
      return new Response(JSON.stringify({ head: 'نتیجه‌ها', hits: [{ lemma: 'Haus' }] }), {
        status: 200,
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(new Request(`${ORIGIN}?q=Haus`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ head: 'نتیجه‌ها', hits: [{ lemma: 'Haus' }] });
  });

  it('forwards a bulk words lookup', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        expect(String(url)).toBe('https://learnboxapp.com/dictionary/search?words=Haus%2CTisch');
        return new Response(JSON.stringify([{ lemma: 'Haus' }]), { status: 200 });
      }),
    );
    const response = await GET(new Request(`${ORIGIN}?words=Haus,Tisch`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ lemma: 'Haus' }]);
  });

  it('fails soft when the upstream site errors or is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const response = await GET(new Request(`${ORIGIN}?q=Haus`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ head: '', hits: [] });
  });

  it('returns an empty result without calling upstream when given no query', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(new Request(ORIGIN));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ head: '', hits: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
