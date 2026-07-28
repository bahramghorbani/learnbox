import { describe, expect, it, vi } from 'vitest';

import {
  SmsIrDeliveryError,
  SmsIrVerificationClient,
  smsIrVerificationClientFromEnvironment,
} from '../src/auth/sms-ir-verification.client.js';

const config = {
  apiKey: 'test-api-key',
  codeParameterName: 'code',
  templateId: 123_456,
};

describe('SmsIrVerificationClient', () => {
  it('sends only the approved template payload through the server-side endpoint', async () => {
    const fetchImplementation = vi.fn(async () => new Response(null, { status: 200 }));
    const client = new SmsIrVerificationClient(config, fetchImplementation);

    await client.sendVerificationCode('+989121234567', '12345');

    expect(fetchImplementation).toHaveBeenCalledWith('https://api.sms.ir/v1/send/verify', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-API-KEY': config.apiKey,
      },
      body: JSON.stringify({
        mobile: '989121234567',
        templateId: config.templateId,
        parameters: [{ name: 'code', value: '12345' }],
      }),
    });
  });

  it('uses a generic delivery failure for provider responses and network faults', async () => {
    const client = new SmsIrVerificationClient(
      config,
      async () => new Response(null, { status: 503 }),
    );

    await expect(client.sendVerificationCode('+989121234567', '12345')).rejects.toBeInstanceOf(
      SmsIrDeliveryError,
    );

    const unavailableClient = new SmsIrVerificationClient(config, async () => {
      throw new Error('provider outage');
    });
    await expect(
      unavailableClient.sendVerificationCode('+989121234567', '12345'),
    ).rejects.toBeInstanceOf(SmsIrDeliveryError);
  });

  it('rejects malformed phone numbers and keeps disabled environment configuration fail-closed', async () => {
    const client = new SmsIrVerificationClient(
      config,
      async () => new Response(null, { status: 200 }),
    );
    await expect(client.sendVerificationCode('+49123456789', '12345')).rejects.toThrow(
      'Iranian E.164 phone number is invalid.',
    );
    expect(smsIrVerificationClientFromEnvironment({ SMS_IR_ENABLED: 'false' })).toBeNull();
    expect(() =>
      smsIrVerificationClientFromEnvironment({
        SMS_IR_ENABLED: 'true',
        SMS_IR_TEMPLATE_ID: '123456',
      }),
    ).toThrow('SMS.ir API key is required.');
  });
});
