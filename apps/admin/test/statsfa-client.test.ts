import { describe, expect, it } from 'vitest';

import { StatsFaClient } from '../lib/server/statsfa-client';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('StatsFaClient', () => {
  it('parses a single page of daily counts, oldest first', async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string | URL) => {
      calls.push(String(url));
      return jsonResponse({
        data: [
          { value: '2026-11-02', count: '5' },
          { value: '2026-11-01', count: '3' },
        ],
        last_page: 1,
      });
    };
    const client = new StatsFaClient('key', fetchImpl as unknown as typeof fetch);
    const series = await client.dailySeries('7132', 'pageviews', '2026-11-01', '2026-11-02');
    expect(series).toEqual([
      { date: '2026-11-01', count: 3 },
      { date: '2026-11-02', count: 5 },
    ]);
    expect(calls[0]).toContain('name=pageviews');
    expect(calls[0]).toContain('/stats/7132');
  });

  it('follows pagination until last_page, capped so a bad response cannot loop forever', async () => {
    let page = 0;
    const fetchImpl = async () => {
      page += 1;
      return jsonResponse({ data: [{ value: `2026-11-0${page}`, count: '1' }], last_page: 3 });
    };
    const client = new StatsFaClient('key', fetchImpl as unknown as typeof fetch);
    const series = await client.dailySeries('7132', 'visitors', '2026-11-01', '2026-11-03');
    expect(series).toHaveLength(3);
    expect(page).toBe(3);
  });

  it('throws on a non-OK response instead of returning an empty series', async () => {
    const fetchImpl = async () => jsonResponse({}, false, 401);
    const client = new StatsFaClient('bad', fetchImpl as unknown as typeof fetch);
    await expect(
      client.dailySeries('7132', 'pageviews', '2026-11-01', '2026-11-02'),
    ).rejects.toThrow('401');
  });

  it('drops rows with a non-numeric count instead of fabricating a value', async () => {
    const fetchImpl = async () =>
      jsonResponse({ data: [{ value: '2026-11-01', count: 'not-a-number' }], last_page: 1 });
    const client = new StatsFaClient('key', fetchImpl as unknown as typeof fetch);
    const series = await client.dailySeries('7132', 'pageviews', '2026-11-01', '2026-11-01');
    expect(series).toEqual([]);
  });

  it('returns top pages by count, highest first, limited', async () => {
    const fetchImpl = async () =>
      jsonResponse({
        data: [
          { value: '/', count: '12' },
          { value: '/contact', count: '4' },
        ],
        last_page: 1,
      });
    const client = new StatsFaClient('key', fetchImpl as unknown as typeof fetch);
    const pages = await client.topPages('7132', '2026-11-01', '2026-11-02', 2);
    expect(pages).toEqual([
      { path: '/', count: 12 },
      { path: '/contact', count: 4 },
    ]);
  });
});
