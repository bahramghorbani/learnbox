import { describe, expect, it } from 'vitest';

import { hashInviteIp, inviteHttpDependenciesFromEnvironment, readInviteRuntimeConfig } from '../lib/alpha-runtime';

const validEnvironment = {
  LEARNBOX_ALPHA_INVITE_ENABLED: 'true',
  LEARNBOX_ALPHA_INVITE_SECRET: 'alpha-runtime-test-secret-that-is-long-enough',
  DATABASE_URL: 'postgres://learnbox:learnbox@localhost:5432/learnbox',
  LEARNBOX_ALPHA_CONSENT_VERSION: 'v1',
};

describe('invite runtime dependencies', () => {
  it('returns null when the server flag is disabled', () => {
    expect(
      inviteHttpDependenciesFromEnvironment({
        ...validEnvironment,
        LEARNBOX_ALPHA_INVITE_ENABLED: 'false',
      }),
    ).toBeNull();
    expect(inviteHttpDependenciesFromEnvironment({})).toBeNull();
  });

  it('returns null when required secrets are missing or invalid', () => {
    expect(
      inviteHttpDependenciesFromEnvironment({ ...validEnvironment, DATABASE_URL: '' }),
    ).toBeNull();
    expect(
      inviteHttpDependenciesFromEnvironment({ ...validEnvironment, LEARNBOX_ALPHA_INVITE_SECRET: '' }),
    ).toBeNull();
    expect(
      inviteHttpDependenciesFromEnvironment({
        ...validEnvironment,
        LEARNBOX_ALPHA_INVITE_SECRET: 'too-short',
      }),
    ).toBeNull();
  });

  it('builds dependencies that hash client IPs with the configured secret', () => {
    const dependencies = inviteHttpDependenciesFromEnvironment(validEnvironment);

    expect(dependencies).not.toBeNull();
    const first = dependencies?.hashClientIp('203.0.113.10') ?? '';
    const second = dependencies?.hashClientIp('203.0.113.10') ?? '';
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-zA-Z0-9_-]{43}$/);
    expect(first).not.toContain('203.0.113.10');
  });

  it('throws for invalid hash inputs', () => {
    const secret = validEnvironment.LEARNBOX_ALPHA_INVITE_SECRET;
    expect(() => hashInviteIp('short', '203.0.113.10')).toThrow(
      'Invite client IP hash input is invalid.',
    );
    expect(() => hashInviteIp(secret, '')).toThrow('Invite client IP hash input is invalid.');
  });

  it('accepts an explicit consent version from the environment', () => {
    expect(readInviteRuntimeConfig(validEnvironment)?.consentVersion).toBe('v1');
    expect(
      readInviteRuntimeConfig({
        ...validEnvironment,
        LEARNBOX_ALPHA_CONSENT_VERSION: 'v2',
      })?.consentVersion,
    ).toBe('v2');
  });

  it('fails closed when no consent version is available', () => {
    expect(
      readInviteRuntimeConfig({ ...validEnvironment, LEARNBOX_ALPHA_CONSENT_VERSION: '' }),
    ).toBeNull();
    expect(
      readInviteRuntimeConfig({ ...validEnvironment, LEARNBOX_ALPHA_CONSENT_VERSION: '   ' }),
    ).toBeNull();
  });
});
