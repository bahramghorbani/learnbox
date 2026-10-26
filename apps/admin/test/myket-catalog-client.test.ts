import { describe, expect, it, vi } from 'vitest';

import { createMyketCatalogClient } from '../lib/server/myket-catalog-client';

describe('Myket catalog client', () => {
  const product = {
    skuId: 'LBP_COURSE_A_123456789ABC',
    farsiTitle: 'بستهٔ آزمون',
    englishTitle: 'LearnBox course-a',
    priceRials: 125000,
    isActive: false,
  };

  it('creates an absent SKU and forces it inactive', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ skus: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const client = createMyketCatalogClient({ accessToken: 'secret', packageName: 'ir.learnbox.app' }, fetchImpl);

    await expect(client.syncProduct(product)).resolves.toBe('created');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, init] = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://developer.myket.ir/api/partners/applications/ir.learnbox.app/products');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toMatchObject({ skuId: product.skuId, isActive: false, price: 125000 });
    expect(String(init.headers)).not.toContain('secret');
  });

  it('updates a known SKU while preserving its existing activation state', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ skus: [{ skuId: product.skuId, isActive: true }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const client = createMyketCatalogClient({ accessToken: 'secret', packageName: 'ir.learnbox.app' }, fetchImpl);

    await expect(client.syncProduct({ ...product, isActive: true })).resolves.toBe('updated');
    const [url, init] = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect(url).toContain(`/products/${product.skuId}`);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toMatchObject({ isActive: true });
    expect(JSON.parse(String(init.body))).not.toHaveProperty('skuId');
  });

  it('redacts upstream failures into one opaque error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('provider detail', { status: 401 }));
    const client = createMyketCatalogClient({ accessToken: 'secret', packageName: 'ir.learnbox.app' }, fetchImpl);
    await expect(client.syncProduct(product)).rejects.toThrow('myket_catalog_unavailable');
  });
});
