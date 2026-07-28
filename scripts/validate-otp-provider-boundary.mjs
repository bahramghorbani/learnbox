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

for (const required of [
  'interface OtpProvider',
  'OtpProviderUnavailableError',
  'providerSubject',
  'clientIpHash',
  "export type OtpPurpose = 'sign-in'",
  'return new DisabledOtpProvider()',
]) {
  if (!providerSource.includes(required)) {
    throw new Error(`OTP provider boundary requirement missing: ${required}`);
  }
}

if (!environmentSource.includes('OTP_DEVELOPMENT_MODE=false')) {
  throw new Error('Development OTP mode must default to disabled.');
}

if (authGateSource.includes('/api/auth/') || authGateSource.includes('/api/development-session')) {
  throw new Error('The local alpha phone UI must not call an unaudited server OTP/session route.');
}

console.info('OTP provider boundary is disabled by default and ready for an approved adapter.');
