import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveLearnerAuthMode } from '../app/learner-auth-mode';

describe('learner authentication mode', () => {
  it.each([
    [undefined, 'local-prototype'],
    ['false', 'local-prototype'],
    ['TRUE', 'local-prototype'],
    [' true', 'local-prototype'],
    ['true', 'server-otp'],
  ] as const)('selects %s as %s', (value, expectedMode) => {
    expect(resolveLearnerAuthMode(value)).toBe(expectedMode);
  });

  it('keeps the public learner OTP UI flag disabled by default', () => {
    expect(readRepositoryFile('.env.example')).toContain(
      'NEXT_PUBLIC_LEARNBOX_OTP_UI_ENABLED=false',
    );
  });
});

describe('learner server OTP boundary', () => {
  it('uses only the existing same-origin OTP routes and shared sequential verifier', () => {
    const source = readWebsiteFile('../app/components/AuthGate.tsx');

    expect(source).toContain("fetch('/api/auth/otp/request'");
    expect(source).toContain("fetch('/api/auth/otp/verify'");
    expect(source).toContain('verifyOtpChallenges(challenges');
  });

  it('keeps OTP values only in component memory and never falls back to prototype sign-in', () => {
    const source = readWebsiteFile('../app/components/AuthGate.tsx');

    expect(source).not.toMatch(/localStorage|sessionStorage|console\./);
    expect(source).not.toMatch(/fallback.{0,40}local|local.{0,40}fallback/i);
    expect(source).toContain("mode === 'local-prototype'");
    expect(source).toContain("mode === 'server-otp'");
  });
});

function readWebsiteFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), 'test', relativePath), 'utf8');
}

function readRepositoryFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), '../..', relativePath), 'utf8');
}
