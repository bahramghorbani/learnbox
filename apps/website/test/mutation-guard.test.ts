import { describe, expect, it } from 'vitest';

import {
  guardMutation,
  isTrustedMutation,
  mutationRejection,
  MUTATION_REJECTION_ERROR,
} from '../lib/mutation-guard';

const ORIGIN = 'https://app.learnboxapp.com';
const ENV = { LEARNBOX_PUBLIC_APP_ORIGIN: ORIGIN };

function req(
  init: { method?: string; origin?: string | null; contentType?: string | null } = {},
): Request {
  const headers = new Headers();
  if (init.origin !== null) headers.set('origin', init.origin ?? ORIGIN);
  if (init.contentType !== null)
    headers.set('content-type', init.contentType ?? 'application/json');
  const method = init.method ?? 'POST';
  // request.url is the INTERNAL address behind the proxy, exactly as in Production.
  return new Request('http://0.0.0.0:3000/api/x', {
    method,
    headers,
    body: method === 'GET' ? undefined : '{}',
  });
}

describe('mutation guard: the single contract', () => {
  it('accepts the canonical origin with JSON, for the declared method', () => {
    expect(guardMutation(req(), { method: 'POST', environment: ENV })).toBeNull();
    expect(
      guardMutation(req({ method: 'PATCH' }), { method: 'PATCH', environment: ENV }),
    ).toBeNull();
  });

  it('accepts application/json with a utf-8 charset and nothing looser', () => {
    for (const contentType of ['application/json', 'application/json; charset=utf-8']) {
      expect(isTrustedMutation(req({ contentType }), { method: 'POST', environment: ENV })).toBe(
        true,
      );
    }
    for (const contentType of [
      'text/plain',
      'application/x-www-form-urlencoded',
      'multipart/form-data; boundary=x',
      'application/jsonp',
      'application/json; charset=latin1',
      'application/json, text/plain',
    ]) {
      expect(isTrustedMutation(req({ contentType }), { method: 'POST', environment: ENV })).toBe(
        false,
      );
    }
    expect(
      isTrustedMutation(req({ contentType: null }), { method: 'POST', environment: ENV }),
    ).toBe(false);
  });

  it('rejects a foreign, lookalike, other-scheme, other-port, null and missing Origin', () => {
    for (const origin of [
      'https://evil.example',
      'https://app.learnboxapp.com.evil.example',
      'https://evilapp.learnboxapp.com',
      'http://app.learnboxapp.com',
      'https://app.learnboxapp.com:8443',
      'null',
      '',
      'not a url',
    ]) {
      expect(isTrustedMutation(req({ origin }), { method: 'POST', environment: ENV })).toBe(false);
    }
    expect(isTrustedMutation(req({ origin: null }), { method: 'POST', environment: ENV })).toBe(
      false,
    );
  });

  it('rejects a method other than the one the route declares', () => {
    expect(isTrustedMutation(req({ method: 'PATCH' }), { method: 'POST', environment: ENV })).toBe(
      false,
    );
    expect(isTrustedMutation(req({ method: 'POST' }), { method: 'PATCH', environment: ENV })).toBe(
      false,
    );
    expect(isTrustedMutation(req({ method: 'GET' }), { method: 'POST', environment: ENV })).toBe(
      false,
    );
  });

  it('never trusts X-Forwarded-* headers to widen the allowed origin', () => {
    const forged = new Request('http://0.0.0.0:3000/api/x', {
      method: 'POST',
      headers: {
        origin: 'https://evil.example',
        'content-type': 'application/json',
        'x-forwarded-host': 'evil.example',
        'x-forwarded-proto': 'https',
      },
      body: '{}',
    });
    expect(isTrustedMutation(forged, { method: 'POST', environment: ENV })).toBe(false);
  });

  it('fails closed when the configured origin is unparseable', () => {
    expect(
      isTrustedMutation(req(), {
        method: 'POST',
        environment: { LEARNBOX_PUBLIC_APP_ORIGIN: '::::' },
      }),
    ).toBe(false);
  });

  it('returns one rejection shape: 403, request_rejected, no-store, no cookie, no detail', async () => {
    const rejected = guardMutation(req({ origin: 'https://evil.example' }), {
      method: 'POST',
      environment: ENV,
    });
    expect(rejected).not.toBeNull();
    expect(rejected!.status).toBe(403);
    expect(await rejected!.json()).toEqual({ error: MUTATION_REJECTION_ERROR });
    expect(rejected!.headers.get('cache-control')).toBe('no-store');
    expect(rejected!.headers.get('set-cookie')).toBeNull();

    // Every failure reason yields a byte-identical body, so the response leaks nothing.
    const bodies = await Promise.all(
      [
        req({ origin: null }),
        req({ contentType: 'text/plain' }),
        req({ method: 'PATCH' }),
        req({ origin: 'https://evil.example' }),
      ].map(async (r) => await guardMutation(r, { method: 'POST', environment: ENV })!.text()),
    );
    expect(new Set(bodies).size).toBe(1);
    expect(await mutationRejection().json()).toEqual({ error: 'request_rejected' });
  });
});
