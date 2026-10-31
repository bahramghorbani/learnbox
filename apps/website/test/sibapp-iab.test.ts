import { describe, expect, it, vi } from 'vitest';

import { createSibappVerifier, readSibappConfig } from '../lib/sibapp-iab';

const config = { secretKey: 'sk', applicationId: 'app-1' };
const json = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const receipt = (overrides: { app?: string; pkg?: string; id?: string } = {}) => ({
  consumed: false,
  id: overrides.id ?? 'P1',
  target: {
    application: { id: overrides.app ?? 'app-1' },
    package: { id: overrides.pkg ?? 'pkg-1', name: '49000' },
  },
});
const verify = (response: Response | Promise<Response>) => {
  const fetchImpl = vi.fn(async () => response);
  return {
    fetchImpl,
    outcome: createSibappVerifier(
      config,
      fetchImpl as unknown as typeof fetch,
    )({
      sku: 'pkg-1',
      purchaseToken: 'P1',
    }),
  };
};

describe('Sibapp receipt verifier', () => {
  it('is paid only when the receipt is this purchase, this app and this package', async () => {
    const { fetchImpl, outcome } = verify(json(200, receipt()));
    expect(await outcome).toEqual({ status: 'paid' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.sibapp.net/api/v1/purchase/P1/validate');
    expect((init.headers as Record<string, string>)['Secret-Key']).toBe('sk');
  });

  it('a real purchase of another package or app is not paid for this SKU', async () => {
    expect(await verify(json(200, receipt({ pkg: 'cheap-pkg' }))).outcome).toEqual({
      status: 'not_paid',
    });
    expect(await verify(json(200, receipt({ app: 'other-app' }))).outcome).toEqual({
      status: 'not_paid',
    });
  });

  it('never treats an unexpected answer, HTTP error or network failure as paid', async () => {
    expect(await verify(json(200, receipt({ id: 'P2' }))).outcome).toEqual({ status: 'error' });
    expect(await verify(json(200, {})).outcome).toEqual({ status: 'error' });
    expect(await verify(json(401, {})).outcome).toEqual({ status: 'error' });
    expect(await verify(json(404, {})).outcome).toEqual({ status: 'error' });
    expect(await verify(Promise.reject(new Error('down'))).outcome).toEqual({ status: 'error' });
  });

  it('is off unless explicitly enabled and fully configured', () => {
    const on = {
      LEARNBOX_SIBAPP_ENABLED: 'true',
      SIBAPP_SECRET_KEY: 'sk',
      SIBAPP_APPLICATION_ID: 'a',
    };
    expect(readSibappConfig(on)).toEqual({ secretKey: 'sk', applicationId: 'a' });
    expect(readSibappConfig({ ...on, LEARNBOX_SIBAPP_ENABLED: 'false' })).toBeNull();
    expect(readSibappConfig({ ...on, SIBAPP_SECRET_KEY: '' })).toBeNull();
    expect(readSibappConfig({ ...on, SIBAPP_APPLICATION_ID: undefined })).toBeNull();
  });
});
