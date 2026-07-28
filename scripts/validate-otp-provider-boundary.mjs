import { readFile } from 'node:fs/promises';

const providerSource = await readFile(
  new URL('../apps/website/lib/otp-provider.ts', import.meta.url),
  'utf8',
);
const authGateSource = await readFile(
  new URL('../apps/website/app/components/AuthGate.tsx', import.meta.url),
  'utf8',
);
const environmentSource = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
const otpChallengeSource = await readFile(
  new URL('../apps/api/src/auth/otp-challenge.ts', import.meta.url),
  'utf8',
);
const otpMigrationSource = await readFile(
  new URL('../database/migrations/0007_otp_challenges.sql', import.meta.url),
  'utf8',
);
const otpStoreSource = await readFile(
  new URL('../apps/api/src/auth/postgres-otp-challenge.store.ts', import.meta.url),
  'utf8',
);

for (const required of [
  'interface OtpProvider',
  'OtpProviderUnavailableError',
  'providerSubject',
  'clientIpHash',
  "export type OtpPurpose = 'sign_in'",
  'return new DisabledOtpProvider()',
]) {
  if (!providerSource.includes(required)) {
    throw new Error(`OTP provider boundary requirement missing: ${required}`);
  }
}

if (!environmentSource.includes('OTP_DEVELOPMENT_MODE=false')) {
  throw new Error('Development OTP mode must default to disabled.');
}

for (const required of [
  'otpPolicy',
  'otpRequestPolicy',
  'createOtpCode',
  'evaluateOtpRequestRateLimit',
  'hashOtpCode',
  'evaluateOtpVerification',
  "export type OtpPurpose = 'sign_in'",
  "status: 'used'",
  "status: 'expired'",
  "status: 'locked'",
]) {
  if (!otpChallengeSource.includes(required)) {
    throw new Error(`OTP challenge core requirement missing: ${required}`);
  }
}

for (const required of ['CREATE TABLE otp_challenges', 'phone_hash', 'code_hash', 'consumed_at']) {
  if (!otpMigrationSource.includes(required)) {
    throw new Error(`OTP challenge migration requirement missing: ${required}`);
  }
}

for (const required of [
  'FOR UPDATE',
  'SET consumed_at',
  'SET attempt_count',
  "client.query('COMMIT')",
]) {
  if (!otpStoreSource.includes(required)) {
    throw new Error(`OTP challenge persistence requirement missing: ${required}`);
  }
}

if (authGateSource.includes('/api/auth/') || authGateSource.includes('/api/development-session')) {
  throw new Error('The local alpha phone UI must not call an unaudited server OTP/session route.');
}

for (const required of ['در این نسخهٔ آزمایشی، پیامکی ارسال نمی‌شود', 'ورود آزمایشی به LearnBox']) {
  if (!authGateSource.includes(required)) {
    throw new Error(`The local alpha phone UI must disclose its prototype status: ${required}`);
  }
}

console.info('OTP provider boundary is disabled by default and ready for an approved adapter.');
