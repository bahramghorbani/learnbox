import { buildHealthReport, healthStatusCode, type DependencyProbe } from '../../../lib/health';
import { readHealthDependencies } from '../../../lib/health-runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Unauthenticated liveness/readiness probe for external uptime monitoring (LB-B02).
 *
 * Deliberately public so a third-party uptime check can read it without credentials, therefore the
 * body carries coarse dependency states only — never connection details, driver errors or any
 * learner data. See `lib/health.ts` for the boundary rules.
 */
export async function GET(): Promise<Response> {
  const dependencies: readonly DependencyProbe[] = readHealthDependencies();
  const report = await buildHealthReport(dependencies, {
    revision: process.env.LEARNBOX_REVISION,
  });

  return Response.json(report, {
    status: healthStatusCode(report.status),
    headers: { 'cache-control': 'no-store' },
  });
}
