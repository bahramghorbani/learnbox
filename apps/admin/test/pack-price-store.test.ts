import { describe, expect, it } from 'vitest';

import { PostgresPackPriceStore } from '../lib/server/postgres-pack-price-store';

const ACTOR = '66666666-6666-4666-8666-666666666666';

function fakePool(priceTomans: number) {
  return {
    async connect() {
      return {
        async query(sql: string) {
          expect(sql).toContain('admin_set_pack_price');
          return { rows: [{ price_tomans: priceTomans }] };
        },
        release() {},
      };
    },
  };
}

describe('PostgresPackPriceStore.setPrice digit normalization', () => {
  it('accepts a price typed in Persian digits', async () => {
    const store = new PostgresPackPriceStore(fakePool(10000));
    const result = await store.setPrice({
      packId: 'a1-animal-names-basic-5',
      priceTomans: '۱۰۰۰۰',
      actorUserId: ACTOR,
    });
    expect(result).toEqual({ status: 'applied', priceTomans: 10000 });
  });

  it('accepts a price with Persian thousands separators', async () => {
    const store = new PostgresPackPriceStore(fakePool(10000));
    const result = await store.setPrice({
      packId: 'a1-animal-names-basic-5',
      priceTomans: '۱۰٬۰۰۰',
      actorUserId: ACTOR,
    });
    expect(result).toEqual({ status: 'applied', priceTomans: 10000 });
  });

  it('still rejects non-numeric garbage after normalization', async () => {
    const store = new PostgresPackPriceStore(fakePool(10000));
    const result = await store.setPrice({
      packId: 'a1-animal-names-basic-5',
      priceTomans: 'abc',
      actorUserId: ACTOR,
    });
    expect(result).toEqual({ status: 'invalid' });
  });
});
