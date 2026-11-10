/**
 * Thin client for the StatsFA analytics API (the self-hosted script already live on
 * `learnboxapp.com` and `app.learnboxapp.com`). This is the ONLY source for the Admin «گزارش
 * بازدیدها» screen — there is no internal pageview/session-log table (apps/api has none), so
 * building a parallel tracking pipeline here would duplicate a service we already pay for and run.
 *
 * Confirmed against the live API (2026-11-10), not guessed from the public docs alone:
 *   GET https://statsfa.com/api/v1/stats/{websiteId}?name={name}&from=YYYY-MM-DD&to=YYYY-MM-DD
 *   -> { data: [{ value: string; count: string }], total, last_page, ... } (Laravel-paginated).
 * `name=pageviews` / `name=visitors` bucket by day (`value` = ISO date); `name=page` breaks down
 * by path. Counts arrive as numeric strings. A day with zero traffic is simply absent from `data`
 * — it is never a reason to backfill a `0` ourselves; the store decides how to present gaps.
 */

export type StatsFaDayPoint = { date: string; count: number };
export type StatsFaTopRow = { path: string; count: number };

type StatsFaPage = { data?: { value?: unknown; count?: unknown }[]; last_page?: number };

const baseUrl = 'https://statsfa.com/api/v1';
/** Guards against an unexpected infinite-pagination response; a real range never needs this many. */
const maxPages = 10;

export class StatsFaClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async fetchRows(
    websiteId: string,
    name: string,
    from: string,
    to: string,
    perPage: number,
  ): Promise<{ value: string; count: number }[]> {
    const rows: { value: string; count: number }[] = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const url = new URL(`${baseUrl}/stats/${encodeURIComponent(websiteId)}`);
      url.searchParams.set('name', name);
      url.searchParams.set('from', from);
      url.searchParams.set('to', to);
      url.searchParams.set('per_page', String(perPage));
      url.searchParams.set('page', String(page));
      const response = await this.fetchImpl(url.toString(), {
        headers: { Authorization: `Bearer ${this.apiKey}`, Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(`StatsFA ${name} request failed with ${response.status}`);
      }
      const body = (await response.json()) as StatsFaPage;
      for (const row of body.data ?? []) {
        if (typeof row.value !== 'string') continue;
        const count = Number(row.count);
        if (!Number.isFinite(count)) continue;
        rows.push({ value: row.value, count });
      }
      if (!body.last_page || page >= body.last_page) break;
    }
    return rows;
  }

  /** Daily totals for `pageviews` or `visitors` over an inclusive date range, oldest first. */
  async dailySeries(
    websiteId: string,
    name: 'pageviews' | 'visitors',
    from: string,
    to: string,
  ): Promise<StatsFaDayPoint[]> {
    const rows = await this.fetchRows(websiteId, name, from, to, 100);
    return rows
      .map((row) => ({ date: row.value, count: row.count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /** Top pages by view count over the range, highest first. */
  async topPages(
    websiteId: string,
    from: string,
    to: string,
    limit: number,
  ): Promise<StatsFaTopRow[]> {
    const rows = await this.fetchRows(websiteId, 'page', from, to, limit);
    return rows.slice(0, limit).map((row) => ({ path: row.value, count: row.count }));
  }
}
