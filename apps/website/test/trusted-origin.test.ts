import { describe, expect, it } from 'vitest';

import {
  configuredPublicOrigins,
  hasJsonContentType,
  isTrustedJsonMutation,
  isTrustedRequestOrigin,
  type EnvironmentSource,
} from '../lib/trusted-origin';

const CANONICAL = 'https://app.learnboxapp.com';

/** Request as it arrives inside Next standalone behind a TLS proxy. */
function proxiedRequest(headers: Record<string, string | undefined>): Request {
  const init: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) init[key] = value;
  }
  // request.url is the INTERNAL listen address — this is the whole point of the fix.
  return new Request('http://0.0.0.0:3000/api/learner/reviews', {
    method: 'POST',
    headers: init,
    body: '{}',
  });
}

const env: EnvironmentSource = { LEARNBOX_PUBLIC_APP_ORIGIN: CANONICAL };

describe('trusted-origin: canonical origin acceptance behind a proxy', () => {
  it('accepts the canonical public origin even though request.url is internal', () => {
    const request = proxiedRequest({ origin: CANONICAL, 'content-type': 'application/json' });
    expect(isTrustedRequestOrigin(request, env)).toBe(true);
  });

  it('accepts a canonical origin carrying an explicit default https port', () => {
    const request = proxiedRequest({ origin: 'https://app.learnboxapp.com:443' });
    expect(isTrustedRequestOrigin(request, env)).toBe(true);
  });
});

describe('trusted-origin: hostile origins are rejected', () => {
  const hostile = [
    ['foreign origin', 'https://evil.example'],
    ['suffix lookalike', 'https://app.learnboxapp.com.evil.example'],
    ['prefix lookalike', 'https://evil-app.learnboxapp.com'],
    ['subdomain of canonical', 'https://x.app.learnboxapp.com'],
    ['downgraded scheme', 'http://app.learnboxapp.com'],
    ['non-default port', 'https://app.learnboxapp.com:444'],
    ['malformed origin', 'not-a-url'],
    ['empty origin', ''],
    ['null origin', 'null'],
    ['whitespace padded foreign', '  https://evil.example  '],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html,x'],
  ] as const;

  for (const [label, origin] of hostile) {
    it(`rejects ${label}`, () => {
      expect(isTrustedRequestOrigin(proxiedRequest({ origin }), env)).toBe(false);
    });
  }

  it('rejects a missing Origin header', () => {
    expect(isTrustedRequestOrigin(proxiedRequest({}), env)).toBe(false);
  });
});

describe('trusted-origin: forwarded headers are never trusted', () => {
  const spoofs = [
    { 'x-forwarded-host': 'evil.example' },
    { 'x-forwarded-host': 'app.learnboxapp.com' },
    { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'evil.example' },
    { 'x-forwarded-for': 'evil.example' },
    { host: 'evil.example' },
    { host: 'app.learnboxapp.com' },
    { forwarded: 'host=evil.example;proto=https' },
  ];

  for (const [index, spoof] of spoofs.entries()) {
    it(`cannot promote a foreign origin via spoof #${index + 1}`, () => {
      const request = proxiedRequest({ origin: 'https://evil.example', ...spoof });
      expect(isTrustedRequestOrigin(request, env)).toBe(false);
    });
  }

  it('cannot demote the canonical origin via spoofed headers', () => {
    const request = proxiedRequest({
      origin: CANONICAL,
      'x-forwarded-host': 'evil.example',
      host: 'evil.example',
    });
    expect(isTrustedRequestOrigin(request, env)).toBe(true);
  });
});

describe('trusted-origin: configuration handling fails closed', () => {
  it('returns null when unconfigured so callers use strict same-origin', () => {
    expect(configuredPublicOrigins({} as EnvironmentSource)).toBeNull();
    expect(
      configuredPublicOrigins({ LEARNBOX_PUBLIC_APP_ORIGIN: '   ' } as EnvironmentSource),
    ).toBeNull();
  });

  it('yields an empty allowlist (deny-all) when configured with only invalid values', () => {
    const broken = { LEARNBOX_PUBLIC_APP_ORIGIN: 'not-a-url' } as EnvironmentSource;
    expect(configuredPublicOrigins(broken)).toEqual([]);
    expect(isTrustedRequestOrigin(proxiedRequest({ origin: CANONICAL }), broken)).toBe(false);
  });

  it('never widens trust to a wildcard', () => {
    const wild = { LEARNBOX_PUBLIC_APP_ORIGIN: '*' } as EnvironmentSource;
    expect(configuredPublicOrigins(wild)).toEqual([]);
    expect(isTrustedRequestOrigin(proxiedRequest({ origin: 'https://evil.example' }), wild)).toBe(
      false,
    );
  });

  it('normalises and de-duplicates a configured list, ignoring invalid entries', () => {
    const multi = {
      LEARNBOX_PUBLIC_APP_ORIGIN: `${CANONICAL}, ${CANONICAL}/ignored-path , bad , https://staging.learnboxapp.com`,
    } as EnvironmentSource;
    expect(configuredPublicOrigins(multi)).toEqual([CANONICAL, 'https://staging.learnboxapp.com']);
  });

  it('falls back to strict same-origin when unconfigured', () => {
    const same = new Request('https://app.learnboxapp.com/api/learner/reviews', {
      method: 'POST',
      headers: { origin: CANONICAL, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(isTrustedRequestOrigin(same, {} as EnvironmentSource)).toBe(true);
    expect(
      isTrustedRequestOrigin(proxiedRequest({ origin: CANONICAL }), {} as EnvironmentSource),
    ).toBe(false);
  });
});

describe('trusted-origin: JSON mutation gate', () => {
  it('requires POST', () => {
    const get = new Request('http://0.0.0.0:3000/api/learner/reviews', {
      method: 'GET',
      headers: { origin: CANONICAL, 'content-type': 'application/json' },
    });
    expect(isTrustedJsonMutation(get, { environment: env })).toBe(false);
  });

  it('accepts a well-formed canonical JSON POST', () => {
    const request = proxiedRequest({ origin: CANONICAL, 'content-type': 'application/json' });
    expect(isTrustedJsonMutation(request, { environment: env })).toBe(true);
  });

  it('enforces the exact content-type contract when requested', () => {
    const loose = proxiedRequest({
      origin: CANONICAL,
      'content-type': 'application/json; charset=utf-16',
    });
    expect(hasJsonContentType(loose, false)).toBe(true);
    expect(hasJsonContentType(loose, true)).toBe(false);
  });

  it('rejects form content types used by classic CSRF', () => {
    for (const contentType of [
      'application/x-www-form-urlencoded',
      'multipart/form-data',
      'text/plain',
    ]) {
      const request = proxiedRequest({ origin: CANONICAL, 'content-type': contentType });
      expect(isTrustedJsonMutation(request, { environment: env })).toBe(false);
    }
  });
});
