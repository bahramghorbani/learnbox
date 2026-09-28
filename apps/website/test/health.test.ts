import { describe, expect, it } from 'vitest';

import {
  aggregateState,
  buildHealthReport,
  healthStatusCode,
  runDependencyProbe,
  type DependencyProbe,
} from '../lib/health';

const ok = (): Promise<void> => Promise.resolve();
const fail = (): Promise<void> => Promise.reject(new Error('boom: postgres://user:pw@host/db'));

describe('dependency probe', () => {
  it('reports ok for a fast successful probe', async () => {
    const report = await runDependencyProbe({ name: 'database', probe: ok });
    expect(report).toMatchObject({ name: 'database', state: 'ok' });
  });

  it('reports down instead of throwing when the dependency fails', async () => {
    const report = await runDependencyProbe({ name: 'database', probe: fail });
    expect(report.state).toBe('down');
  });

  it('never leaks probe failure detail into the report', async () => {
    const report = await runDependencyProbe({ name: 'database', probe: fail });
    expect(JSON.stringify(report)).not.toContain('postgres://');
    expect(JSON.stringify(report)).not.toContain('boom');
  });

  it('reports degraded when the probe is slower than its threshold', async () => {
    let current = 0;
    const clock = (): number => current;
    const slow: DependencyProbe = {
      name: 'database',
      degradedAfterMs: 10,
      probe: () => {
        current = 50;
        return Promise.resolve();
      },
    };
    const report = await runDependencyProbe(slow, clock);
    expect(report.state).toBe('degraded');
  });

  it('reports down when a probe never settles', async () => {
    const report = await runDependencyProbe({
      name: 'database',
      timeoutMs: 5,
      probe: () => new Promise<void>(() => {}),
    });
    expect(report.state).toBe('down');
  });
});

describe('aggregate state', () => {
  it('is ok only when every dependency is ok', () => {
    expect(aggregateState([{ name: 'a', state: 'ok', durationMs: 1 }])).toBe('ok');
  });

  it('degrades when any dependency is degraded', () => {
    expect(
      aggregateState([
        { name: 'a', state: 'ok', durationMs: 1 },
        { name: 'b', state: 'degraded', durationMs: 1 },
      ]),
    ).toBe('degraded');
  });

  it('is down when any dependency is down, even alongside degraded', () => {
    expect(
      aggregateState([
        { name: 'a', state: 'degraded', durationMs: 1 },
        { name: 'b', state: 'down', durationMs: 1 },
      ]),
    ).toBe('down');
  });
});

describe('health report', () => {
  it('summarises every dependency and stamps the check time', async () => {
    const report = await buildHealthReport(
      [
        { name: 'database', probe: ok },
        { name: 'media', probe: ok },
      ],
      { clock: () => new Date('2026-09-28T10:00:00.000Z') },
    );

    expect(report.status).toBe('ok');
    expect(report.checkedAt).toBe('2026-09-28T10:00:00.000Z');
    expect(report.dependencies.map((d) => d.name)).toEqual(['database', 'media']);
  });

  it('stays 200 while degraded and only fails the probe when down', () => {
    expect(healthStatusCode('ok')).toBe(200);
    expect(healthStatusCode('degraded')).toBe(200);
    expect(healthStatusCode('down')).toBe(503);
  });

  it('reports down overall when a single dependency is down', async () => {
    const report = await buildHealthReport([
      { name: 'database', probe: fail },
      { name: 'media', probe: ok },
    ]);
    expect(report.status).toBe('down');
    expect(healthStatusCode(report.status)).toBe(503);
  });

  it('carries no secret material for an unauthenticated caller', async () => {
    const report = await buildHealthReport([{ name: 'database', probe: fail }], {
      revision: 'abc1234',
    });
    const serialised = JSON.stringify(report);
    for (const forbidden of ['postgres://', 'password', 'secret', 'DATABASE_URL', 'neon.tech']) {
      expect(serialised).not.toContain(forbidden);
    }
  });
});
