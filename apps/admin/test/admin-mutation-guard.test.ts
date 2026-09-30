import { describe, expect, it } from 'vitest';

import { readAdminAuthConfig } from '../lib/server/admin-auth-policy';
import { guardAdminMutation } from '../lib/server/admin-mutation-guard';

const enabled = readAdminAuthConfig({
  LEARNBOX_ADMIN_PASSKEY_ENABLED: 'true',
  LEARNBOX_ADMIN_ORIGIN: 'https://admin.example.test',
  LEARNBOX_ADMIN_RP_ID: 'admin.example.test',
  LEARNBOX_ADMIN_TOKEN_HASH_KEY: 'k'.repeat(48),
});
const disabled = readAdminAuthConfig({});
const post = (headers: Record<string, string>) =>
  new Request('https://admin.example.test/api/x', { method: 'POST', headers, body: '{}' });

describe('guardAdminMutation (LB-B30)', () => {
  it('passes a same-origin JSON request', () => {
    expect(
      guardAdminMutation(post({ origin: 'https://admin.example.test', 'content-type': 'application/json' }), enabled, ['application/json']),
    ).toBeNull();
  });

  it.each([
    ['foreign origin', { origin: 'https://evil.example', 'content-type': 'application/json' }],
    ['missing origin', { 'content-type': 'application/json' }],
    ['null origin', { origin: 'null', 'content-type': 'application/json' }],
  ])('rejects a %s with 403 request_rejected and no-store', async (_name, headers) => {
    const response = guardAdminMutation(post(headers), enabled, ['application/json']);
    expect(response?.status).toBe(403);
    expect(response?.headers.get('cache-control')).toBe('no-store');
    expect(await response?.json()).toEqual({ error: 'request_rejected' });
  });

  it('rejects a wrong content type with 415 content_type_required', async () => {
    const response = guardAdminMutation(
      post({ origin: 'https://admin.example.test', 'content-type': 'text/plain' }),
      enabled,
      ['application/json'],
    );
    expect(response?.status).toBe(415);
    expect(await response?.json()).toEqual({ error: 'content_type_required' });
  });

  it('answers 404 when Admin authentication is disabled', () => {
    const response = guardAdminMutation(
      post({ origin: 'https://admin.example.test', 'content-type': 'application/json' }),
      disabled,
      ['application/json'],
    );
    expect(response?.status).toBe(404);
  });

  it('never reads cookies or the body (pure header check)', () => {
    const request = post({ origin: 'https://evil.example', 'content-type': 'application/json', cookie: 'x=1' });
    guardAdminMutation(request, enabled, ['application/json']);
    expect(request.bodyUsed).toBe(false);
  });
});
