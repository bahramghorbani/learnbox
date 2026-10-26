/**
 * Myket product-catalog API boundary — server-to-server only.
 *
 * The access token is accepted solely from Admin's process environment and is sent only to
 * developer.myket.ir. No route or UI receives it. `syncMyketProduct` creates or updates exactly
 * one deterministic SKU. New products are created inactive; updates preserve the product's existing
 * activation state, so synchronizing catalogue facts never activates or deactivates checkout.
 *
 * Docs: https://myket.ir/kb/pages/manage-sku-items/
 */
export type MyketCatalogConfig = { accessToken: string; packageName: string; timeoutMs?: number };

export type MyketCatalogProduct = {
  skuId: string;
  farsiTitle: string;
  englishTitle: string;
  /** IRR, as required by Myket; LearnBox canonical prices are Tomans. */
  priceRials: number;
  isActive: boolean;
};

export type MyketCatalogClient = {
  syncProduct(product: MyketCatalogProduct): Promise<'created' | 'updated'>;
};

type MyketProductList = { skus?: unknown };

type KnownSku = { isActive: boolean };

function knownSku(value: unknown, skuId: string): KnownSku | undefined {
  if (!Array.isArray(value)) return undefined;
  const item = value.find((candidate) =>
    typeof candidate === 'object' && candidate !== null && (candidate as { skuId?: unknown }).skuId === skuId,
  ) as { isActive?: unknown } | undefined;
  return item ? { isActive: item.isActive === true } : undefined;
}

function baseUrl(packageName: string): string {
  return `https://developer.myket.ir/api/partners/applications/${encodeURIComponent(packageName)}/products`;
}

export function createMyketCatalogClient(
  config: MyketCatalogConfig,
  fetchImpl: typeof fetch = fetch,
): MyketCatalogClient {
  const timeoutMs = config.timeoutMs ?? 10000;
  const headers = {
    'X-Access-Token': config.accessToken,
    'content-type': 'application/json',
    accept: 'application/json',
  };
  return {
    async syncProduct(product) {
      try {
        // Product create is non-idempotent. Read first so an interrupted Admin request can safely
        // be retried as PUT rather than failing on a duplicate SKU.
        const listed = await fetchImpl(`${baseUrl(config.packageName)}?limit=1000&offset=0`, {
          headers: { 'X-Access-Token': config.accessToken, accept: 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
          cache: 'no-store',
        });
        if (!listed.ok) throw new Error('myket_list_failed');
        const list = (await listed.json()) as MyketProductList;
        const existing = knownSku(list.skus, product.skuId);
        const response = await fetchImpl(
          existing ? `${baseUrl(config.packageName)}/${encodeURIComponent(product.skuId)}` : baseUrl(config.packageName),
          {
            method: existing ? 'PUT' : 'POST',
            headers,
            body: JSON.stringify(
              existing
                ? {
                    farsiTitle: product.farsiTitle,
                    englishTitle: product.englishTitle,
                    price: product.priceRials,
                    // Sync never changes an already configured activation decision.
                    isActive: existing.isActive,
                  }
                : {
                    skuId: product.skuId,
                    farsiTitle: product.farsiTitle,
                    englishTitle: product.englishTitle,
                    price: product.priceRials,
                    isActive: false,
                  },
            ),
            signal: AbortSignal.timeout(timeoutMs),
            cache: 'no-store',
          },
        );
        if (!response.ok) throw new Error('myket_sync_failed');
        return existing ? 'updated' : 'created';
      } catch (error) {
        // Deliberately opaque to the browser/audit: HTTP provider bodies may echo sensitive detail.
        throw new Error('myket_catalog_unavailable', { cause: error });
      }
    },
  };
}
