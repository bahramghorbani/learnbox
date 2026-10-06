import { describe, expect, it } from 'vitest';

import {
  createZarinpalProvider,
  isZarinpalAuthority,
  RIALS_PER_TOMAN,
  tomansToRials,
  zarinpalEndpoints,
} from '../lib/zarinpal';
import {
  describeZarinpalConfiguration,
  isZarinpalMerchantId,
  readZarinpalConfig,
  zarinpalProviderFromEnvironment,
} from '../lib/zarinpal-config';

/**
 * M2.4 — the Zarinpal HTTP contract and its configuration gate.
 *
 * No network and no credential: `fetch` is replaced with a recorder, so the real adapter's request
 * shape and response handling are exercised against Zarinpal's documented v4 payloads. Contacting
 * the live gateway with a fake Merchant ID is forbidden, and would prove nothing anyway.
 *
 * The merchant id used throughout is an obviously-fake UUID. It is asserted to stay out of
 * everything that leaves the module.
 */

const fakeMerchantId = '00000000-0000-4000-8000-000000000000';
const authority = `A${'0'.repeat(35)}`;

type Recorded = { url: string; body: Record<string, unknown> };

/** A `fetch` stand-in that records calls and replays a fixed Zarinpal payload. */
function recordingFetch(
  payload: unknown,
  init: { status?: number; throws?: boolean } = {},
): { fetch: typeof fetch; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const impl = (async (url: string, options: { body: string }) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) as Record<string, unknown> });
    if (init.throws) throw new Error('network down');
    return {
      ok: (init.status ?? 200) < 400,
      status: init.status ?? 200,
      json: async () => payload,
    };
  }) as unknown as typeof fetch;
  return { fetch: impl, calls };
}

const provider = (payload: unknown, init?: { status?: number; throws?: boolean }) => {
  const recorder = recordingFetch(payload, init);
  return {
    recorder,
    instance: createZarinpalProvider({ merchantId: fakeMerchantId, sandbox: true }, recorder.fetch),
  };
};

describe('M2.4 Zarinpal amount units', () => {
  it('converts tomans to rials, because the gateway settles in rials', () => {
    expect(RIALS_PER_TOMAN).toBe(10);
    expect(tomansToRials(150000)).toBe(1500000);
    expect(tomansToRials(1)).toBe(10);
  });

  it('refuses amounts that cannot be charged', () => {
    // A zero or negative amount reaching the gateway would be a silent pricing bug.
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => tomansToRials(bad)).toThrow(/positive integer/);
    }
  });
});

describe('M2.4 Zarinpal endpoints', () => {
  it('uses separate hosts for sandbox and production', () => {
    expect(zarinpalEndpoints(true).requestUrl).toBe(
      'https://sandbox.zarinpal.com/pg/v4/payment/request.json',
    );
    expect(zarinpalEndpoints(false).requestUrl).toBe(
      'https://payment.zarinpal.com/pg/v4/payment/request.json',
    );
    expect(zarinpalEndpoints(false).verifyUrl).toBe(
      'https://payment.zarinpal.com/pg/v4/payment/verify.json',
    );
    // A sandbox misconfiguration must not be able to reach the real money host.
    expect(zarinpalEndpoints(true).startPayUrl).toContain('sandbox.zarinpal.com');
  });

  it('accepts only plausible authority strings', () => {
    expect(isZarinpalAuthority(authority)).toBe(true);
    for (const bad of ['', 'short', "'; DROP TABLE x; --", null, undefined, 42, 'A'.repeat(100)]) {
      expect(isZarinpalAuthority(bad)).toBe(false);
    }
  });
});

describe('M2.4 Zarinpal payment request', () => {
  it('sends the merchant id, the rial amount and the callback, and returns the authority', async () => {
    const { instance, recorder } = provider({ data: { code: 100, authority }, errors: [] });

    const outcome = await instance.requestPayment({
      amountTomans: 150000,
      callbackUrl: 'https://app.learnbox.example/api/store/purchase/callback',
      description: 'خرید بسته',
    });

    expect(outcome).toEqual({ status: 'created', authority });
    expect(recorder.calls[0].url).toBe('https://sandbox.zarinpal.com/pg/v4/payment/request.json');
    expect(recorder.calls[0].body).toMatchObject({
      merchant_id: fakeMerchantId,
      amount: 1500000,
      callback_url: 'https://app.learnbox.example/api/store/purchase/callback',
    });
  });

  it('reports a gateway refusal as rejected, with the gateway code', async () => {
    const { instance } = provider({ data: [], errors: [{ code: -9, message: 'validation' }] });
    await expect(
      instance.requestPayment({
        amountTomans: 1000,
        callbackUrl: 'https://x.test/cb',
        description: 'd',
      }),
    ).resolves.toEqual({ status: 'rejected', code: -9 });
  });

  it('reports a network failure as error, not as refusal', async () => {
    const { instance } = provider({}, { throws: true });
    // "Unknown" must stay distinguishable from "declined".
    await expect(
      instance.requestPayment({
        amountTomans: 1000,
        callbackUrl: 'https://x.test/cb',
        description: 'd',
      }),
    ).resolves.toEqual({ status: 'error' });
  });

  it('reports a gateway 5xx as error', async () => {
    const { instance } = provider({ data: [], errors: [] }, { status: 503 });
    await expect(
      instance.requestPayment({
        amountTomans: 1000,
        callbackUrl: 'https://x.test/cb',
        description: 'd',
      }),
    ).resolves.toEqual({ status: 'error' });
  });

  it('treats a missing or malformed authority as a refusal', async () => {
    const { instance } = provider({ data: { code: 100, authority: 'bogus' }, errors: [] });
    await expect(
      instance.requestPayment({
        amountTomans: 1000,
        callbackUrl: 'https://x.test/cb',
        description: 'd',
      }),
    ).resolves.toMatchObject({ status: 'rejected' });
  });

  it('builds the gateway redirect from the authority', () => {
    const { instance } = provider({});
    expect(instance.paymentUrl(authority)).toBe(
      `https://sandbox.zarinpal.com/pg/StartPay/${authority}`,
    );
    expect(() => instance.paymentUrl('bogus')).toThrow(/authority/i);
  });
});

describe('M2.4 Zarinpal payment verification', () => {
  it('verifies with the stored amount and returns the reference id', async () => {
    const { instance, recorder } = provider({
      data: { code: 100, ref_id: 123456789, card_pan: '1234****5678' },
      errors: [],
    });

    const outcome = await instance.verifyPayment({ amountTomans: 150000, authority });

    expect(outcome).toEqual({
      status: 'verified',
      referenceId: '123456789',
      alreadyVerified: false,
    });
    expect(recorder.calls[0].url).toBe('https://sandbox.zarinpal.com/pg/v4/payment/verify.json');
    expect(recorder.calls[0].body).toMatchObject({
      merchant_id: fakeMerchantId,
      amount: 1500000,
      authority,
    });
  });

  it('treats code 101 as an already-verified success, not a failure', async () => {
    const { instance } = provider({ data: { code: 101, ref_id: 55 }, errors: [] });
    // Zarinpal answers 101 when the payment was verified by an earlier call. A replayed callback
    // reaching this must still be a success, or a paid learner would be told they failed.
    await expect(instance.verifyPayment({ amountTomans: 1000, authority })).resolves.toEqual({
      status: 'verified',
      referenceId: '55',
      alreadyVerified: true,
    });
  });

  it('reports an unpaid payment as rejected', async () => {
    const { instance } = provider({ data: [], errors: [{ code: -51 }] });
    await expect(instance.verifyPayment({ amountTomans: 1000, authority })).resolves.toEqual({
      status: 'rejected',
      code: -51,
    });
  });

  it('reports an unreachable gateway as error, never as unpaid', async () => {
    const { instance } = provider({}, { throws: true });
    await expect(instance.verifyPayment({ amountTomans: 1000, authority })).resolves.toEqual({
      status: 'error',
    });
  });

  it('treats a success without a reference id as unresolved', async () => {
    const { instance } = provider({ data: { code: 100 }, errors: [] });
    // Verified but unreconcilable would leave support nothing to trace; better to retry.
    await expect(instance.verifyPayment({ amountTomans: 1000, authority })).resolves.toEqual({
      status: 'error',
    });
  });

  it('refuses a malformed authority without calling the gateway', async () => {
    const { instance, recorder } = provider({ data: { code: 100, ref_id: 1 }, errors: [] });
    await expect(
      instance.verifyPayment({ amountTomans: 1000, authority: "'; DELETE FROM x; --" }),
    ).resolves.toEqual({ status: 'rejected', code: 0 });
    expect(recorder.calls).toHaveLength(0);
  });
});

describe('M2.4 Zarinpal configuration gate', () => {
  const complete = {
    LEARNBOX_ZARINPAL_ENABLED: 'true',
    ZARINPAL_MERCHANT_ID: fakeMerchantId,
    LEARNBOX_PUBLIC_APP_ORIGIN: 'https://app.learnbox.example',
  };

  it('validates the merchant id shape', () => {
    expect(isZarinpalMerchantId(fakeMerchantId)).toBe(true);
    // Placeholders must fail configuration rather than produce rejected live payments.
    for (const bad of ['', 'changeme', 'TODO', fakeMerchantId.slice(0, 20), null, 42]) {
      expect(isZarinpalMerchantId(bad)).toBe(false);
    }
  });

  it('returns a config only when every prerequisite is present', () => {
    expect(readZarinpalConfig(complete)).toEqual({
      merchantId: fakeMerchantId,
      sandbox: true,
      callbackOrigin: 'https://app.learnbox.example',
    });
    expect(readZarinpalConfig({ ...complete, LEARNBOX_ZARINPAL_ENABLED: 'false' })).toBeNull();
    expect(readZarinpalConfig({ ...complete, ZARINPAL_MERCHANT_ID: 'changeme' })).toBeNull();
    expect(readZarinpalConfig({ ...complete, LEARNBOX_PUBLIC_APP_ORIGIN: undefined })).toBeNull();
    // An http callback origin is refused: a payment return must not be downgradeable.
    expect(
      readZarinpalConfig({
        ...complete,
        LEARNBOX_PUBLIC_APP_ORIGIN: 'http://app.learnbox.example',
      }),
    ).toBeNull();
  });

  it('defaults to sandbox unless production is chosen explicitly', () => {
    expect(readZarinpalConfig(complete)?.sandbox).toBe(true);
    expect(readZarinpalConfig({ ...complete, ZARINPAL_SANDBOX: 'true' })?.sandbox).toBe(true);
    expect(readZarinpalConfig({ ...complete, ZARINPAL_SANDBOX: 'yes' })?.sandbox).toBe(true);
    // Only the exact string 'false' opts into real money.
    expect(readZarinpalConfig({ ...complete, ZARINPAL_SANDBOX: 'false' })?.sandbox).toBe(false);
  });

  it('builds no provider when payment is unconfigured', () => {
    expect(zarinpalProviderFromEnvironment({})).toBeNull();
    expect(zarinpalProviderFromEnvironment(complete)).not.toBeNull();
  });

  describe('status description', () => {
    it('reports disabled, incomplete and ready distinctly', () => {
      expect(describeZarinpalConfiguration({}).state).toBe('disabled');
      expect(describeZarinpalConfiguration({ LEARNBOX_ZARINPAL_ENABLED: 'true' }).state).toBe(
        'incomplete',
      );
      expect(describeZarinpalConfiguration(complete).state).toBe('ready');
    });

    it('names what is missing without revealing any value', () => {
      const status = describeZarinpalConfiguration({ LEARNBOX_ZARINPAL_ENABLED: 'true' });
      expect(status.missing).toContain('ZARINPAL_MERCHANT_ID');
      expect(status.missing).toContain('LEARNBOX_PUBLIC_APP_ORIGIN');
      expect(JSON.stringify(status)).not.toContain(fakeMerchantId);
    });

    it('exposes at most the last four characters of the merchant id', () => {
      const status = describeZarinpalConfiguration(complete);
      expect(status.merchantIdHint).toBe('0000');
      expect(status.merchantIdValid).toBe(true);
      // The full credential must never appear in the status payload.
      expect(JSON.stringify(status)).not.toContain(fakeMerchantId);
      expect(status.merchantIdHint?.length).toBe(4);
    });

    it('offers no hint for an invalid credential', () => {
      const status = describeZarinpalConfiguration({ ...complete, ZARINPAL_MERCHANT_ID: 'nope' });
      expect(status.merchantIdPresent).toBe(true);
      expect(status.merchantIdValid).toBe(false);
      expect(status.merchantIdHint).toBeNull();
    });
  });
});
