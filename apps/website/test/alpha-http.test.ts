import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST as inviteCheck } from '../app/api/auth/invite/check/route';
import { readInviteRuntimeConfig } from '../lib/alpha-runtime';

import type { InviteHttpDependencies } from '../lib/alpha-http';
import { handleInviteCheck } from '../lib/alpha-http';

const originalEnabled = process.env.LEARNBOX_ALPHA_INVITE_ENABLED;
const originalSecret = process.env.LEARNBOX_ALPHA_INVITE_SECRET;
const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  restoreEnv('LEARNBOX_ALPHA_INVITE_ENABLED', originalEnabled);
  restoreEnv('LEARNBOX_ALPHA_INVITE_SECRET', originalSecret);
  restoreEnv('DATABASE_URL', originalDatabaseUrl);
});

function restoreEnv(
  key: 'LEARNBOX_ALPHA_INVITE_ENABLED' | 'LEARNBOX_ALPHA_INVITE_SECRET' | 'DATABASE_URL',
  value: string | undefined,
) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

const validEnvironment = {
  LEARNBOX_ALPHA_INVITE_ENABLED: 'true',
  LEARNBOX_ALPHA_INVITE_SECRET: 'alpha-runtime-test-secret-that-is-long-enough',
  DATABASE_URL: 'postgres://learnbox:learnbox@localhost:5432/learnbox',
  LEARNBOX_ALPHA_CONSENT_VERSION: 'v1',
};

function post(path: string, body: unknown) {
  return new Request(`https://learnbox-preview.vercel.app${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://learnbox-preview.vercel.app',
      'x-forwarded-for': '203.0.113.10',
    },
    body: JSON.stringify(body),
  });
}

describe('invite runtime config', () => {
  it('fails closed unless the server flag is exactly true', () => {
    expect(readInviteRuntimeConfig({ LEARNBOX_ALPHA_INVITE_ENABLED: 'false' })).toBeNull();
    expect(readInviteRuntimeConfig({ LEARNBOX_ALPHA_INVITE_ENABLED: 'TRUE' })).toBeNull();
    expect(readInviteRuntimeConfig({})).toBeNull();
  });

  it('requires a database URL and a long invite secret', () => {
    expect(readInviteRuntimeConfig({ ...validEnvironment, DATABASE_URL: '' })).toBeNull();
    expect(
      readInviteRuntimeConfig({ ...validEnvironment, DATABASE_URL: 'mysql://localhost/db' }),
    ).toBeNull();
    expect(
      readInviteRuntimeConfig({ ...validEnvironment, LEARNBOX_ALPHA_INVITE_SECRET: 'short' }),
    ).toBeNull();
  });

  it('accepts a fully configured environment with an explicit consent version', () => {
    const config = readInviteRuntimeConfig(validEnvironment);

    expect(config).not.toBeNull();
    expect(config?.inviteSecret).toBe(validEnvironment.LEARNBOX_ALPHA_INVITE_SECRET);
    expect(config?.consentVersion).toBe('v1');
  });
});

describe('disabled invite route', () => {
  it('responds 404 before touching any dependency', async () => {
    process.env.LEARNBOX_ALPHA_INVITE_ENABLED = 'false';
    delete process.env.LEARNBOX_ALPHA_INVITE_SECRET;
    delete process.env.DATABASE_URL;

    const response = await inviteCheck(post('/api/auth/invite/check', { code: 'ALPHA-2026' }));

    expect(response.status).toBe(404);
  });
});

describe('invite check handler', () => {
  function dependenciesWith(outcome: Awaited<ReturnType<InviteHttpDependencies['checkInvite']>>) {
    const checkInvite = vi.fn(async () => outcome);
    return {
      checkInvite,
      dependencies: {
        hashClientIp: (ip: string) => `hash:${ip}`,
        checkInvite,
        consentVersion: 'v1',
      },
    };
  }

  it('rejects non-JSON and cross-origin requests', async () => {
    const { dependencies } = dependenciesWith({ status: 'accepted', alreadyConsented: false });

    const wrongMethod = await handleInviteCheck(
      new Request('https://learnbox-preview.vercel.app/api/auth/invite/check', {
        method: 'GET',
        headers: { origin: 'https://learnbox-preview.vercel.app' },
      }),
      dependencies,
    );
    expect(wrongMethod.status).toBe(403);

    const crossOrigin = await handleInviteCheck(
      new Request('https://learnbox-preview.vercel.app/api/auth/invite/check', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://evil.example',
          'x-forwarded-for': '203.0.113.10',
        },
        body: JSON.stringify({ code: 'ALPHA-2026' }),
      }),
      dependencies,
    );
    expect(crossOrigin.status).toBe(403);
  });

  it('rejects a malformed body without calling the service', async () => {
    const { checkInvite, dependencies } = dependenciesWith({
      status: 'accepted',
      alreadyConsented: false,
    });

    const response = await handleInviteCheck(
      post('/api/auth/invite/check', { notACode: true }),
      dependencies,
    );

    expect(response.status).toBe(400);
    expect(checkInvite).not.toHaveBeenCalled();
  });

  it('maps service outcomes to invite_invalid, invite_limited and retry-after responses', async () => {
    const invalid = dependenciesWith({ status: 'invalid' });
    expect(
      (
        await handleInviteCheck(
          post('/api/auth/invite/check', { code: 'ALPHA-2026' }),
          invalid.dependencies,
        )
      ).status,
    ).toBe(400);

    const limited = dependenciesWith({ status: 'limited' });
    expect(
      (
        await handleInviteCheck(
          post('/api/auth/invite/check', { code: 'ALPHA-2026' }),
          limited.dependencies,
        )
      ).status,
    ).toBe(403);

    const rateLimited = dependenciesWith({ status: 'rate_limited', retryAfterMs: 42_000 });
    const rateResponse = await handleInviteCheck(
      post('/api/auth/invite/check', { code: 'ALPHA-2026' }),
      rateLimited.dependencies,
    );
    expect(rateResponse.status).toBe(429);
    expect(rateResponse.headers.get('retry-after')).toBe('42');
  });

  it('accepts a valid code with an empty 204 response', async () => {
    const { checkInvite, dependencies } = dependenciesWith({
      status: 'accepted',
      alreadyConsented: false,
    });

    const response = await handleInviteCheck(
      post('/api/auth/invite/check', { code: 'ALPHA-2026' }),
      dependencies,
    );

    expect(response.status).toBe(204);
    expect(checkInvite).toHaveBeenCalledOnce();
    expect(checkInvite).toHaveBeenCalledWith({ code: 'ALPHA-2026', ipHash: 'hash:203.0.113.10' });
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('fails closed with 503 when the service throws', async () => {
    const { dependencies } = dependenciesWith({ status: 'accepted', alreadyConsented: false });
    dependencies.checkInvite = vi.fn(async () => {
      throw new Error('store down');
    });

    const response = await handleInviteCheck(
      post('/api/auth/invite/check', { code: 'ALPHA-2026' }),
      dependencies,
    );

    expect(response.status).toBe(503);
  });
});
