import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createAdminSplashServer } from '../lib/server/admin-splash-server.js';

const enabledEnvironment = {
  LEARNBOX_ADMIN_SPLASH_REPLACEMENT_ENABLED: 'true',
  LEARNBOX_ADMIN_PASSKEY_ENABLED: 'true',
  LEARNBOX_ADMIN_ORIGIN: 'https://admin.learnbox.app',
  LEARNBOX_ADMIN_RP_ID: 'admin.learnbox.app',
  LEARNBOX_ADMIN_TOKEN_HASH_KEY: 'k'.repeat(32),
  DATABASE_URL: 'postgresql://learnbox:secret@example.neon.tech/learnbox?sslmode=require',
  BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_test_token_value',
};

describe('admin splash server', () => {
  it('documents the replacement capability as disabled by default without a token', () => {
    const example = readFileSync(resolve(process.cwd(), '../..', '.env.example'), 'utf8');
    expect(example).toContain('LEARNBOX_ADMIN_SPLASH_REPLACEMENT_ENABLED=false');
    expect(example).toContain('# BLOB_READ_WRITE_TOKEN=');
  });

  it('does not initialize persistence or storage unless both owner gates are enabled', () => {
    let initialized = false;
    const server = createAdminSplashServer({
      environment: {},
      createPool: () => {
        initialized = true;
        throw new Error('must not run');
      },
      createStorage: () => {
        initialized = true;
        throw new Error('must not run');
      },
    });

    expect(server).toEqual({ enabled: false });
    expect(initialized).toBe(false);
  });

  it('fails closed when a required private storage setting is absent', () => {
    const { BLOB_READ_WRITE_TOKEN: _token, ...environment } = enabledEnvironment;
    const server = createAdminSplashServer({
      environment,
      createPool: () => {
        throw new Error('must not run');
      },
      createStorage: () => {
        throw new Error('must not run');
      },
    });

    expect(server).toEqual({ enabled: false });
  });

  it('wires protected routes to the verified database and private store', () => {
    let connectionString = '';
    let blobToken = '';
    const client = {
      query: async () => ({ rows: [] as Record<string, unknown>[] }),
      release: () => undefined,
    };
    const server = createAdminSplashServer({
      environment: enabledEnvironment,
      createPool: (config) => {
        connectionString = config.connectionString;
        return { query: client.query, connect: async () => client };
      },
      createStorage: (token) => {
        blobToken = token;
        return {
          read: async () => undefined,
          upload: async () => undefined,
          delete: async () => undefined,
        };
      },
      normalize: async () => ({ kind: 'rejected', code: 'invalid_image' }),
    });

    expect(server.enabled).toBe(true);
    if (!server.enabled) throw new Error('expected enabled splash server');
    expect(server.current).toBeTypeOf('function');
    expect(server.preview).toBeTypeOf('function');
    expect(server.replace).toBeTypeOf('function');
    expect(connectionString).toContain('sslmode=verify-full');
    expect(blobToken).toBe(enabledEnvironment.BLOB_READ_WRITE_TOKEN);
  });
});
