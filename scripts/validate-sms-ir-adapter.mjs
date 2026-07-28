import { readFile } from 'node:fs/promises';

const clientSource = await readFile(
  new URL('../apps/api/src/auth/sms-ir-verification.client.ts', import.meta.url),
  'utf8',
);
const providerSource = await readFile(
  new URL('../apps/website/lib/otp-provider.ts', import.meta.url),
  'utf8',
);
const environmentSource = await readFile(new URL('../.env.example', import.meta.url), 'utf8');

for (const required of [
  'https://api.sms.ir/v1/send/verify',
  "'X-API-KEY'",
  'SMS_IR_ENABLED',
  'SMS_IR_TEMPLATE_ID',
  'SMS_IR_CODE_PARAMETER_NAME',
  'SMS_IR_API_KEY',
  'SmsIrDeliveryError',
]) {
  if (!clientSource.includes(required)) {
    throw new Error(`SMS.ir delivery adapter requirement missing: ${required}`);
  }
}

if (!environmentSource.includes('SMS_IR_ENABLED=false')) {
  throw new Error('SMS.ir delivery must default to disabled.');
}

if (!providerSource.includes('return new DisabledOtpProvider()')) {
  throw new Error('The browser-facing OTP provider must remain fail-closed.');
}

if (providerSource.includes('SMS_IR_API_KEY') || providerSource.includes('sms.ir')) {
  throw new Error('The browser-facing OTP provider must not contain SMS.ir credentials or calls.');
}

console.info('SMS.ir delivery client is prepared and disabled by default.');
