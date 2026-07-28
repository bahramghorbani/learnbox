const smsIrVerifyUrl = 'https://api.sms.ir/v1/send/verify';

export interface SmsIrVerificationConfig {
  apiKey: string;
  codeParameterName: string;
  templateId: number;
}

export class SmsIrDeliveryError extends Error {
  constructor() {
    super('SMS delivery is currently unavailable.');
    this.name = 'SmsIrDeliveryError';
  }
}

export class SmsIrVerificationClient {
  constructor(
    private readonly config: SmsIrVerificationConfig,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {
    if (!config.apiKey.trim()) throw new Error('SMS.ir API key is required.');
    if (!Number.isSafeInteger(config.templateId) || config.templateId < 1) {
      throw new Error('SMS.ir template ID must be a positive integer.');
    }
    if (!/^#?[A-Za-z][A-Za-z0-9_-]{0,63}#?$/.test(config.codeParameterName)) {
      throw new Error('SMS.ir code parameter name is invalid.');
    }
  }

  /**
   * Sends a LearnBox-generated code through an approved SMS.ir verification template. This method
   * does not verify a code, issue a session, log a recipient, or expose the provider response.
   */
  async sendVerificationCode(phoneE164: string, code: string): Promise<void> {
    if (!/^\+989\d{9}$/.test(phoneE164)) throw new Error('Iranian E.164 phone number is invalid.');
    if (!/^\d{5}$/.test(code)) throw new Error('OTP code is invalid.');

    let response: Response;
    try {
      response = await this.fetchImplementation(smsIrVerifyUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-API-KEY': this.config.apiKey,
        },
        body: JSON.stringify({
          mobile: phoneE164.slice(1),
          templateId: this.config.templateId,
          parameters: [{ name: this.config.codeParameterName, value: code }],
        }),
      });
    } catch {
      throw new SmsIrDeliveryError();
    }

    if (!response.ok) throw new SmsIrDeliveryError();
  }
}

/**
 * Configuration stays disabled unless an owner deliberately enables it in the deployment secret
 * store. Returning null is intentional: callers must keep the OTP provider fail-closed.
 */
export function smsIrVerificationClientFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): SmsIrVerificationClient | null {
  if (environment.SMS_IR_ENABLED !== 'true') return null;

  const templateId = Number(environment.SMS_IR_TEMPLATE_ID);
  return new SmsIrVerificationClient({
    apiKey: environment.SMS_IR_API_KEY ?? '',
    codeParameterName: environment.SMS_IR_CODE_PARAMETER_NAME ?? '',
    templateId,
  });
}
