import { describe, expect, it } from 'vitest';

import { readAdminDatabaseConfig, requireAdminDatabaseTls } from '../lib/server/admin-database';
import { getSharedAdminDatabasePool } from '../lib/server/admin-database-pool';

describe('admin database configuration', () => {
  it('requires a database URL and upgrades hosted connections to full TLS verification', () => {
    expect(() => readAdminDatabaseConfig({})).toThrow('DATABASE_URL');
    expect(
      readAdminDatabaseConfig({
        DATABASE_URL:
          'postgresql://learnbox:secret@example.neon.tech/learnbox?sslmode=require&channel_binding=require',
      }),
    ).toEqual({
      connectionString:
        'postgresql://learnbox:secret@example.neon.tech/learnbox?sslmode=verify-full&channel_binding=require',
      max: 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
    });
  });

  it('preserves unrelated connection parameters', () => {
    expect(requireAdminDatabaseTls('postgresql://localhost/learnbox?application_name=admin')).toBe(
      'postgresql://localhost/learnbox?application_name=admin&sslmode=verify-full',
    );
  });

  it('shares one bounded pool configuration across Admin routes', () => {
    const config = readAdminDatabaseConfig({ DATABASE_URL: 'postgresql://localhost/learnbox' });
    const first = getSharedAdminDatabasePool(config, () => ({
      connect: async () => ({}),
      query: async () => ({}),
    }));
    const second = getSharedAdminDatabasePool(config, () => {
      throw new Error('must reuse the existing pool');
    });

    expect(config.max).toBe(2);
    expect(config.idleTimeoutMillis).toBe(10_000);
    expect(config.connectionTimeoutMillis).toBe(5_000);
    expect(second).toBe(first);
  });

  it('shares a pool for equivalent configurations regardless of property order', () => {
    const base = readAdminDatabaseConfig({ DATABASE_URL: 'postgresql://localhost/learnbox' });
    const equivalent = {
      connectionTimeoutMillis: base.connectionTimeoutMillis,
      idleTimeoutMillis: base.idleTimeoutMillis,
      max: base.max,
      connectionString: base.connectionString,
    };
    const createPool = () => ({ connect: async () => ({}), query: async () => ({}) });

    expect(getSharedAdminDatabasePool(base, createPool)).toBe(
      getSharedAdminDatabasePool(equivalent, () => {
        throw new Error('must reuse an equivalent configuration');
      }),
    );
  });

  it('creates separate pools when a complete pool configuration changes', () => {
    const base = readAdminDatabaseConfig({ DATABASE_URL: 'postgresql://localhost/learnbox' });
    const alternate = { ...base, connectionString: 'postgresql://localhost/other' };
    const createPool = () => ({ connect: async () => ({}), query: async () => ({}) });

    expect(getSharedAdminDatabasePool(alternate, createPool)).not.toBe(
      getSharedAdminDatabasePool(base, createPool),
    );
  });
});
