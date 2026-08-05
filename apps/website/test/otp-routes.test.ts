import { afterEach, describe, expect, it } from 'vitest';

import { POST as requestOtp } from '../app/api/auth/otp/request/route';
import { POST as verifyOtp } from '../app/api/auth/otp/verify/route';

const originalEnabled = process.env.SMS_IR_ENABLED;

afterEach(() => {
  if (originalEnabled === undefined) delete process.env.SMS_IR_ENABLED;
  else process.env.SMS_IR_ENABLED = originalEnabled;
});

function post(path: string, body: unknown) {
  return new Request(`https://learnbox-preview.vercel.app${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://learnbox-preview.vercel.app',
      'x-forwarded-for': '203.0.113.10',
    },
    body: JSON.stringify(body),
  });
}

describe('disabled OTP routes', () => {
  it('fails closed before touching delivery or persistence', async () => {
    process.env.SMS_IR_ENABLED = 'false';

    const requestResponse = await requestOtp(
      post('/api/auth/otp/request', { phone: '09121234567' }),
    );
    const verifyResponse = await verifyOtp(
      post('/api/auth/otp/verify', {
        challengeId: 'd3f1ddca-f8e8-45c8-bdc6-67eef1ab1aed',
        code: '12345',
      }),
    );

    expect(requestResponse.status).toBe(503);
    expect(verifyResponse.status).toBe(503);
    expect(verifyResponse.headers.has('set-cookie')).toBe(false);
  });
});
