import { afterEach, expect, it, vi } from 'vitest';
import { resolveLearnerAuthMode } from '../app/learner-auth-mode';

afterEach(() => vi.unstubAllEnvs());

it('fails closed to server OTP in release builds when the flag is missing or false', () => {
  vi.stubEnv('NODE_ENV', 'production');
  expect(resolveLearnerAuthMode()).toBe('server-otp');
  expect(resolveLearnerAuthMode('false')).toBe('server-otp');
});

it('reserves local prototype login for isolated test fixtures', () => {
  vi.stubEnv('NODE_ENV', 'test');
  expect(resolveLearnerAuthMode('false')).toBe('local-prototype');
  expect(resolveLearnerAuthMode('true')).toBe('server-otp');
});
