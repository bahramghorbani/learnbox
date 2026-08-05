import { describe, expect, it } from 'vitest';

import { hashOtpClientIp, readOtpRuntimeConfig } from '../lib/otp-runtime';

const completeEnvironment = {
  DATABASE_URL: 'postgresql://learnbox:secret@example.neon.tech/learnbox?sslmode=require',
  LEARNBOX_OTP_SECRET: 'otp-runtime-test-secret-that-is-long-enough',
  SMS_IR_API_KEY: 'private-test-key',
  SMS_IR_CODE_PARAMETER_NAME: 'OTP',
  SMS_IR_ENABLED: 'true',
  SMS_IR_TEMPLATE_ID: '495140',
};

describe('readOtpRuntimeConfig', () => {
  it('fails closed unless real SMS delivery is explicitly enabled', () => {
    expect(readOtpRuntimeConfig({ ...completeEnvironment, SMS_IR_ENABLED: 'false' })).toBeNull();
  });

  it('accepts only the complete approved server configuration', () => {
    expect(readOtpRuntimeConfig(completeEnvironment)).toEqual({
      databaseUrl: completeEnvironment.DATABASE_URL,
      otpSecret: completeEnvironment.LEARNBOX_OTP_SECRET,
      sms: {
        apiKey: 'private-test-key',
        codeParameterName: 'OTP',
        templateId: 495140,
      },
    });
    expect(readOtpRuntimeConfig({ ...completeEnvironment, SMS_IR_API_KEY: '' })).toBeNull();
  });
});

describe('hashOtpClientIp', () => {
  it('turns the network address into a stable opaque abuse-control key', () => {
    expect(hashOtpClientIp(completeEnvironment.LEARNBOX_OTP_SECRET, '203.0.113.10')).toBe(
      '03SilS-zYipIKmLy47m9M0QEAtFIbo3qaQG8dvBLEK0',
    );
  });
});
