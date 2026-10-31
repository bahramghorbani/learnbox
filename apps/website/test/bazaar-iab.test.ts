import { describe, expect, it, vi } from 'vitest';

import { createBazaarVerifier, readBazaarConfig } from '../lib/bazaar-iab';

const config = {
  clientId: 'cid',
  clientSecret: 'sec',
  refreshToken: 'rt',
  packageName: 'ir.learnbox.app',
};
const json = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

/** Token endpoint → access token; validate endpoint → the given answers in order. */
function fakeBazaar(...answers: Response[]) {
  let tokens = 0;
  const fetchImpl = vi.fn(async (url: RequestInfo | URL) =>
    String(url).endsWith('/auth/token/')
      ? json(200, { access_token: `tok${(tokens += 1)}` })
      : answers.shift()!,
  );
  return fetchImpl;
}

describe('Cafe Bazaar receipt verifier', () => {
  // Each case uses a distinct refresh token so the module-level token cache never leaks between cases.
  let n = 0;
  const verify = (fetchImpl: typeof fetch) =>
    createBazaarVerifier(
      { ...config, refreshToken: `rt${(n += 1)}` },
      fetchImpl,
    )({
      sku: 'sku1',
      purchaseToken: 'pt1',
    });

  it('maps purchaseState 0 to paid and sends the raw token (no Bearer) to the validate URL', async () => {
    const fetchImpl = fakeBazaar(json(200, { purchaseState: 0 }));
    expect(await verify(fetchImpl)).toEqual({ status: 'paid' });
    const [url, init] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://pardakht.cafebazaar.ir/devapi/v2/api/validate/ir.learnbox.app/inapp/sku1/purchases/pt1/',
    );
    expect((init.headers as Record<string, string>).Authorization).toBe('tok1');
  });

  it('treats refunds and 404 not_found as not paid', async () => {
    expect(await verify(fakeBazaar(json(200, { purchaseState: 1 })))).toEqual({
      status: 'not_paid',
    });
    expect(await verify(fakeBazaar(json(404, { error: 'not_found' })))).toEqual({
      status: 'not_paid',
    });
  });

  it('never calls an unknown product, odd state, server error or network failure not-paid', async () => {
    expect(await verify(fakeBazaar(json(404, { error: 'invalid_value' })))).toEqual({
      status: 'error',
    });
    expect(await verify(fakeBazaar(json(200, { purchaseState: 7 })))).toEqual({ status: 'error' });
    expect(await verify(fakeBazaar(json(500, {})))).toEqual({ status: 'error' });
    expect(await verify(vi.fn(async () => Promise.reject(new Error('down'))))).toEqual({
      status: 'error',
    });
  });

  it('refreshes the access token once on 401/403, then gives up as error', async () => {
    const retried = fakeBazaar(json(403, {}), json(200, { purchaseState: 0 }));
    expect(await verify(retried)).toEqual({ status: 'paid' });
    expect(await verify(fakeBazaar(json(401, {}), json(401, {})))).toEqual({ status: 'error' });
  });

  it('is off unless explicitly enabled with every credential', () => {
    const env = { BAZAAR_CLIENT_ID: 'a', BAZAAR_CLIENT_SECRET: 'b', BAZAAR_REFRESH_TOKEN: 'c' };
    expect(readBazaarConfig(env)).toBeNull();
    expect(
      readBazaarConfig({ ...env, LEARNBOX_BAZAAR_ENABLED: 'true', BAZAAR_REFRESH_TOKEN: '' }),
    ).toBeNull();
    expect(readBazaarConfig({ ...env, LEARNBOX_BAZAAR_ENABLED: 'true' })?.packageName).toBe(
      'ir.learnbox.app',
    );
  });
});
