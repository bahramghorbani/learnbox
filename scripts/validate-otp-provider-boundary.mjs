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
const otpRequestMigrationSource = await readFile(
  new URL('../database/migrations/0008_otp_request_events.sql', import.meta.url),
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

if (!environmentSource.includes('NEXT_PUBLIC_LEARNBOX_OTP_UI_ENABLED=false')) {
  throw new Error('Learner OTP UI mode must default to disabled.');
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

for (const required of ['CREATE TABLE otp_request_events', 'ip_hash', 'requested_at']) {
  if (!otpRequestMigrationSource.includes(required)) {
    throw new Error(`OTP request migration requirement missing: ${required}`);
  }
}

for (const required of [
  'FOR UPDATE',
  'pg_advisory_xact_lock',
  'otp_request_events',
  'SET consumed_at',
  'SET attempt_count',
  "client.query('COMMIT')",
]) {
  if (!otpStoreSource.includes(required)) {
    throw new Error(`OTP challenge persistence requirement missing: ${required}`);
  }
}

for (const required of [
  "fetch('/api/auth/otp/request'",
  "fetch('/api/auth/otp/verify'",
  'verifyOtpChallenges(challenges',
  "mode === 'local-prototype'",
  "mode === 'server-otp'",
]) {
  if (!authGateSource.includes(required)) {
    throw new Error(`Learner OTP UI requirement missing: ${required}`);
  }
}

if (authGateSource.match(/localStorage|sessionStorage|console\./)) {
  throw new Error('Learner OTP values must not be persisted or logged in the browser.');
}

if (/fallback.{0,40}local|local.{0,40}fallback/i.test(authGateSource)) {
  throw new Error('Learner OTP UI must not fall back from server OTP to local prototype sign-in.');
}

for (const required of ['در این نسخهٔ آزمایشی، پیامکی ارسال نمی‌شود', 'ورود آزمایشی به LearnBox']) {
  if (!authGateSource.includes(required)) {
    throw new Error(`The local alpha phone UI must disclose its prototype status: ${required}`);
  }
}

console.info('OTP provider boundary is disabled by default and ready for an approved adapter.');
