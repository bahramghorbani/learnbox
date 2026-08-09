import { describe, expect, it } from 'vitest';

import { readAdminDatabaseConfig, requireAdminDatabaseTls } from '../lib/server/admin-database';

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
      max: 4,
    });
  });

  it('preserves unrelated connection parameters', () => {
    expect(requireAdminDatabaseTls('postgresql://localhost/learnbox?application_name=admin')).toBe(
      'postgresql://localhost/learnbox?application_name=admin&sslmode=verify-full',
    );
  });
});
