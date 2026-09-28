/**
 * Production health reporting for LearnBox (LB-B02).
 *
 * The container healthcheck that shipped with v1.0.0 fetched `/` only, which stays 200 while the
 * database is unreachable. This module reports liveness (the process serves traffic) separately
 * from readiness (dependencies the learner experience actually needs).
 *
 * Security boundary: the payload is deliberately unauthenticated so an external uptime probe can
 * read it, therefore it MUST never carry connection strings, credentials, hostnames, driver error
 * text, row counts or learner data. Probes return a coarse state only; failure detail is logged
 * server-side, never serialised here.
 */

export type DependencyState = 'ok' | 'degraded' | 'down';

export type DependencyReport = {
  readonly name: string;
  readonly state: DependencyState;
  readonly durationMs: number;
};

export type HealthReport = {
  readonly status: DependencyState;
  readonly checkedAt: string;
  readonly dependencies: readonly DependencyReport[];
  readonly revision?: string;
};

export type DependencyProbe = {
  readonly name: string;
  /** Resolves when the dependency is usable; rejects or times out when it is not. */
  probe: () => Promise<void>;
  /** A probe slower than this is reported `degraded` rather than `ok`. */
  readonly degradedAfterMs?: number;
  /** A probe slower than this is abandoned and reported `down`. */
  readonly timeoutMs?: number;
};

const defaultDegradedAfterMs = 750;
const defaultTimeoutMs = 4000;

/** Runs one probe, converting any failure into a state. Probe rejections never propagate. */
export async function runDependencyProbe(
  dependency: DependencyProbe,
  now: () => number = Date.now,
): Promise<DependencyReport> {
  const degradedAfterMs = dependency.degradedAfterMs ?? defaultDegradedAfterMs;
  const timeoutMs = dependency.timeoutMs ?? defaultTimeoutMs;
  const started = now();

  let state: DependencyState;
  try {
    await withTimeout(dependency.probe(), timeoutMs);
    state = now() - started >= degradedAfterMs ? 'degraded' : 'ok';
  } catch {
    state = 'down';
  }

  return { name: dependency.name, state, durationMs: Math.max(0, now() - started) };
}

/** The worst dependency state wins: any `down` is down, any `degraded` is degraded. */
export function aggregateState(reports: readonly DependencyReport[]): DependencyState {
  if (reports.some((report) => report.state === 'down')) return 'down';
  if (reports.some((report) => report.state === 'degraded')) return 'degraded';
  return 'ok';
}

export async function buildHealthReport(
  dependencies: readonly DependencyProbe[],
  options: { revision?: string; now?: () => number; clock?: () => Date } = {},
): Promise<HealthReport> {
  const now = options.now ?? Date.now;
  const clock = options.clock ?? (() => new Date());
  const reports = await Promise.all(
    dependencies.map((dependency) => runDependencyProbe(dependency, now)),
  );

  return {
    status: aggregateState(reports),
    checkedAt: clock().toISOString(),
    dependencies: reports,
    ...(options.revision ? { revision: options.revision } : {}),
  };
}

/** `ok`/`degraded` still serve traffic; only `down` is an outage worth paging on. */
export function healthStatusCode(status: DependencyState): number {
  return status === 'down' ? 503 : 200;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('probe failed'));
      },
    );
  });
}
