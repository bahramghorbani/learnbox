import type { Pool } from 'pg';

import { StatsFaClient } from './statsfa-client';

/** Same reader set as the Dashboard and Payments stores: viewing aggregates is a support/operator
 * capability, not an editorial one. */
const readerRoles = ['content_reviewer', 'content_publisher', 'super_admin'] as const;

const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type VisitsSiteConfig = { id: string; domain: string; label: string };

export type VisitsDayPoint = { date: string; pageviews: number; visitors: number };

export type VisitsSiteOverview = {
  domain: string;
  label: string;
  pageviewsTotal: number;
  visitorsTotal: number;
  series: VisitsDayPoint[];
  topPages: { path: string; count: number }[];
};

export type VisitsOverview = { windowDays: number; sites: VisitsSiteOverview[] };

export type VisitsOverviewResult =
  { status: 'ok'; overview: VisitsOverview } | { status: 'forbidden' } | { status: 'unavailable' };

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Admin «گزارش بازدیدها» read model. Numbers and series come entirely from StatsFA
 * (`statsfa-client.ts`) for the two tracked domains — there is no internal pageview table to read
 * instead. The only database access here is the same role check every Admin aggregate store does;
 * it never touches learner, pack or payment rows.
 */
export class AdminVisitsStore {
  constructor(
    private readonly pool: Pool,
    private readonly client: StatsFaClient,
    private readonly sites: VisitsSiteConfig[],
  ) {}

  private async hasRole(actorUserId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM admin_role_assignments
        WHERE user_id = $1::uuid AND role::text = ANY($2::text[]) LIMIT 1`,
      [actorUserId, readerRoles],
    );
    return result.rows.length > 0;
  }

  async readOverview(input: {
    actorUserId: string;
    windowDays?: number;
    now?: Date;
  }): Promise<VisitsOverviewResult> {
    if (!canonicalUuidPattern.test(input.actorUserId)) {
      throw new Error('Actor user id is invalid.');
    }
    if (!(await this.hasRole(input.actorUserId))) {
      return { status: 'forbidden' };
    }

    const windowDays = Math.min(Math.max(input.windowDays ?? 14, 1), 90);
    const now = input.now ?? new Date();
    const to = isoDate(now);
    const from = isoDate(new Date(now.getTime() - (windowDays - 1) * 24 * 60 * 60 * 1000));

    try {
      const sites = await Promise.all(
        this.sites.map(async (site): Promise<VisitsSiteOverview> => {
          const [pageviews, visitors, topPages] = await Promise.all([
            this.client.dailySeries(site.id, 'pageviews', from, to),
            this.client.dailySeries(site.id, 'visitors', from, to),
            this.client.topPages(site.id, from, to, 5),
          ]);
          const byDate = new Map<string, VisitsDayPoint>();
          for (const point of pageviews) {
            byDate.set(point.date, { date: point.date, pageviews: point.count, visitors: 0 });
          }
          for (const point of visitors) {
            const existing = byDate.get(point.date) ?? {
              date: point.date,
              pageviews: 0,
              visitors: 0,
            };
            existing.visitors = point.count;
            byDate.set(point.date, existing);
          }
          const series = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
          return {
            domain: site.domain,
            label: site.label,
            pageviewsTotal: pageviews.reduce((sum, point) => sum + point.count, 0),
            visitorsTotal: visitors.reduce((sum, point) => sum + point.count, 0),
            series,
            topPages,
          };
        }),
      );
      return { status: 'ok', overview: { windowDays, sites } };
    } catch {
      // StatsFA unreachable, rate-limited, or returned something unparseable — surface as
      // unavailable, never as a zero that would read as "actually no traffic".
      return { status: 'unavailable' };
    }
  }
}
