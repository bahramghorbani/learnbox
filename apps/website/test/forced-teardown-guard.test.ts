import { EventEmitter } from 'node:events';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  guardForcedTeardown,
  isExpectedForcedTeardownError,
} from './support/forced-teardown-guard';

/**
 * Regression for the CI teardown flake: `DROP DATABASE … WITH (FORCE)` kills idle pooled clients
 * and pg raised the resulting 57P01 FATAL as an uncaught exception. The guard must absorb exactly
 * that error during teardown, and nothing else.
 */
describe('forced-teardown guard (decision table)', () => {
  const fatal = Object.assign(new Error('terminating connection due to administrator command'), {
    code: '57P01',
  });

  it('absorbs 57P01 only once teardown has begun', () => {
    expect(isExpectedForcedTeardownError(fatal, true)).toBe(true);
    expect(isExpectedForcedTeardownError(fatal, false)).toBe(false);
  });

  it('never absorbs a different SQLSTATE or a non-pg error', () => {
    for (const code of ['57014', '53300', '08006', '42P01', undefined]) {
      expect(isExpectedForcedTeardownError(Object.assign(new Error('x'), { code }), true)).toBe(
        false,
      );
    }
    expect(isExpectedForcedTeardownError(new Error('boom'), true)).toBe(false);
    expect(isExpectedForcedTeardownError(null, true)).toBe(false);
    expect(isExpectedForcedTeardownError('57P01', true)).toBe(false);
  });
});

describe('forced-teardown guard (listener behaviour, no database)', () => {
  const make = () => {
    const pool = new EventEmitter() as unknown as Pool;
    const guard = guardForcedTeardown(pool);
    return { pool: pool as unknown as EventEmitter, guard };
  };
  const fatal = Object.assign(new Error('terminating connection due to administrator command'), {
    code: '57P01',
  });

  it('re-throws 57P01 while the suite is still running (an unexpected disconnect is a real failure)', () => {
    const { pool } = make();
    expect(() => pool.emit('error', fatal)).toThrow('terminating connection');
  });

  it('re-throws unexpected errors even during teardown', () => {
    const { pool, guard } = make();
    guard.beginTeardown();
    expect(() =>
      pool.emit('error', Object.assign(new Error('disk full'), { code: '53100' })),
    ).toThrow('disk full');
  });

  it('absorbs 57P01 during teardown, on the pool and on each connected client', () => {
    const { pool, guard } = make();
    guard.beginTeardown();
    expect(() => pool.emit('error', fatal)).not.toThrow();
    const client = new EventEmitter();
    pool.emit('connect', client);
    expect(() => client.emit('error', fatal)).not.toThrow();
    expect(() => client.emit('error', new Error('other'))).toThrow('other');
  });
});

const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');
const dbSuite = url ? describe : describe.skip;

dbSuite('forced-teardown guard (real Postgres)', () => {
  let admin: Pool;
  const names: string[] = [];

  beforeAll(() => {
    admin = new Pool({ connectionString: url, max: 1 });
    admin.on('error', () => undefined);
  });
  afterAll(async () => {
    for (const n of names) await admin.query(`DROP DATABASE IF EXISTS ${n} WITH (FORCE)`);
    await admin.end();
  });

  const scratch = async (): Promise<{ pool: Pool; name: string }> => {
    const name = `fts_${Math.random().toString(36).slice(2, 10)}`;
    names.push(name);
    await admin.query(`CREATE DATABASE ${name}`);
    const scoped = new URL(url as string);
    scoped.pathname = `/${name}`;
    return { pool: new Pool({ connectionString: scoped.toString(), max: 4 }), name };
  };

  it('a guarded pool survives DROP DATABASE … WITH (FORCE) with idle clients attached', async () => {
    const uncaught: Array<{ code?: string }> = [];
    const capture = (e: { code?: string }) => uncaught.push(e);
    process.on('uncaughtException', capture);
    try {
      const { pool, name } = await scratch();
      const guard = guardForcedTeardown(pool);
      await Promise.all([1, 2, 3, 4].map(() => pool.query('select 1')));
      guard.beginTeardown();
      await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
      await new Promise((r) => setTimeout(r, 150));
      await pool.end().catch(() => undefined);
      expect(uncaught).toEqual([]);
    } finally {
      process.off('uncaughtException', capture);
    }
  });

  it('WITHOUT the guard the same teardown raises 57P01 (proves the flake is real)', async () => {
    const uncaught: Array<{ code?: string }> = [];
    const capture = (e: { code?: string }) => uncaught.push(e);
    // Vitest also records process-level uncaught errors; temporarily take ownership of them.
    const existing = process.listeners('uncaughtException');
    process.removeAllListeners('uncaughtException');
    process.on('uncaughtException', capture);
    try {
      const { pool, name } = await scratch();
      await Promise.all([1, 2, 3, 4].map(() => pool.query('select 1')));
      await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
      await new Promise((r) => setTimeout(r, 150));
      await pool.end().catch(() => undefined);
      expect(uncaught.length).toBeGreaterThan(0);
      expect(uncaught.every((e) => e.code === '57P01')).toBe(true);
    } finally {
      process.removeAllListeners('uncaughtException');
      for (const l of existing) process.on('uncaughtException', l);
    }
  });
});
