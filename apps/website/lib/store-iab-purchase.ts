import { Pool } from 'pg';

import { readPurchasablePack, type PurchaseDenialReason } from './store-purchase';
import type { StoreIabVerifier } from './myket-iab';
import { myketVerifierFromEnvironment } from './myket-config';
import { bazaarVerifierFromEnvironment } from './bazaar-iab';
import { sibappVerifierFromEnvironment } from './sibapp-iab';

/**
 * Store (native Android IAB) purchase verification — Myket today, Cafe Bazaar next.
 *
 * Both stores speak the same AIDL v3 protocol on the client (see `apps/android` billing bridge)
 * and the same shape of server-to-server receipt check: {sku, purchaseToken} in, paid/not-paid
 * out. This module is deliberately provider-agnostic — adding Cafe Bazaar is a second
 * `StoreIabProvider` value, a second `channel`/`billing_provider` enum member, and a second
 * verifier (its own `*-iab.ts`), nothing here changes.
 *
 * Unlike Zarinpal, there is no server-initiated "attempt" — the native app opens the store's own
 * buy flow directly. So the ONLY new server state this module creates is the already-paid
 * receipt's record: one `purchase_orders` row (status `fulfilled` from the start) and one
 * `purchase_events` row (status `verified`), then the entitlement grant — one transaction, so a
 * crash between them cannot record payment without access or access without a record.
 *
 * `provider_purchase_id` is the purchaseToken, which is store-unique by construction, so the
 * `UNIQUE (provider, provider_purchase_id)` constraint is the idempotency lock: a replayed verify
 * call (a flaky network retry on the client) is reported `already_processed`, never double-granted.
 */

export type StoreIabProvider = 'myket' | 'cafe_bazaar' | 'sibapp';

/** `packs.id` is `[a-z0-9-]`; store SKU ids are provider-owned. Their mapping is held in
 * `store_iab_catalog_items`, created by the guarded Admin catalog-sync route — never inferred from
 * client input and never committed as a code-level catalogue. */

const channelFor: Record<StoreIabProvider, string> = {
  myket: 'android_myket',
  cafe_bazaar: 'android_bazaar',
  sibapp: 'ios_sibapp',
};

/** URL slug (`/api/store/purchase/<slug>/...`) → provider and its env-gated verifier. */
export const iabStores: Record<
  string,
  {
    provider: StoreIabProvider;
    verifierFromEnvironment: () => { verifier: StoreIabVerifier } | null;
  }
> = {
  myket: { provider: 'myket', verifierFromEnvironment: () => myketVerifierFromEnvironment() },
  bazaar: {
    provider: 'cafe_bazaar',
    verifierFromEnvironment: () => bazaarVerifierFromEnvironment(),
  },
  sibapp: { provider: 'sibapp', verifierFromEnvironment: () => sibappVerifierFromEnvironment() },
};

export type StoreIabVerifyOutcome =
  | { status: 'verified'; purchaseId: string; packId: string; alreadyEntitled: boolean }
  | { status: 'already_processed'; purchaseId: string }
  /** No pack is mapped to this (provider, sku) pair — operator has not wired this SKU up yet. */
  | { status: 'unknown_sku' }
  /** The canonical price changed after this SKU was synced; do not grant against a stale catalogue. */
  | { status: 'catalog_out_of_sync' }
  | { status: 'pack_denied'; reason: PurchaseDenialReason }
  | { status: 'not_paid' }
  /** Could not reach the store or read its answer. Real outcome unknown — do not grant. */
  | { status: 'provider_error' };

export type StoreIabDependencies = {
  pool: Pick<Pool, 'query' | 'connect'>;
  verifier: StoreIabVerifier;
  /** Test-only fixture mapping. Production resolves the operator-approved mapping from PostgreSQL. */
  skuToPackId?: Record<StoreIabProvider, Record<string, string>>;
};

type StoreSkuMapping = { packId: string; syncedPriceTomans?: number };

/** Resolves the only SKU native code may launch for this learner and offered pack. */
export async function readPurchasableIabSku(
  pool: Pick<Pool, 'query'>,
  userId: string,
  provider: StoreIabProvider,
  packId: string,
): Promise<
  { ok: true; sku: string } | { ok: false; reason: PurchaseDenialReason | 'catalog_out_of_sync' }
> {
  const pack = await readPurchasablePack(pool, userId, packId);
  if (!pack.ok) return pack;
  const result = await pool.query<{ sku_id: string; synced_price_tomans: number }>(
    `SELECT sku_id, synced_price_tomans FROM store_iab_catalog_items
      WHERE provider = $1::billing_provider AND pack_id = $2`,
    [provider, packId],
  );
  const mapping = result.rows[0];
  if (!mapping || Number(mapping.synced_price_tomans) !== pack.amountTomans) {
    return { ok: false, reason: 'catalog_out_of_sync' };
  }
  return { ok: true, sku: mapping.sku_id };
}

async function resolvePackMapping(
  pool: Pick<Pool, 'query'>,
  provider: StoreIabProvider,
  sku: string,
  fixture?: Record<StoreIabProvider, Record<string, string>>,
): Promise<StoreSkuMapping | undefined> {
  const fixturePackId = fixture?.[provider]?.[sku];
  if (fixturePackId) return { packId: fixturePackId };
  const result = await pool.query<{ pack_id: string; synced_price_tomans: number }>(
    `SELECT pack_id, synced_price_tomans FROM store_iab_catalog_items
      WHERE provider = $1::billing_provider AND sku_id = $2`,
    [provider, sku],
  );
  const row = result.rows[0];
  return row
    ? { packId: row.pack_id, syncedPriceTomans: Number(row.synced_price_tomans) }
    : undefined;
}

export async function verifyStoreIabPurchase(
  { pool, verifier, skuToPackId }: StoreIabDependencies,
  input: { userId: string; provider: StoreIabProvider; sku: string; purchaseToken: string },
): Promise<StoreIabVerifyOutcome> {
  if (!input.sku || !input.purchaseToken) return { status: 'unknown_sku' };

  const mapping = await resolvePackMapping(pool, input.provider, input.sku, skuToPackId);
  if (!mapping) return { status: 'unknown_sku' };

  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM purchase_events WHERE provider = $1::billing_provider AND provider_purchase_id = $2`,
    [input.provider, input.purchaseToken],
  );
  if (existing.rows[0]) return { status: 'already_processed', purchaseId: existing.rows[0].id };

  const pack = await readPurchasablePack(pool, input.userId, mapping.packId);
  if (!pack.ok) return { status: 'pack_denied', reason: pack.reason };
  // Neither store's verify returns an amount. Matching this locally recorded snapshot is the only proof we
  // have that the price last synchronized to the store still equals the canonical price we grant for.
  if (mapping.syncedPriceTomans !== undefined && mapping.syncedPriceTomans !== pack.amountTomans) {
    return { status: 'catalog_out_of_sync' };
  }
  const packId = mapping.packId;

  const receipt = await verifier({ sku: input.sku, purchaseToken: input.purchaseToken });
  if (receipt.status === 'error') return { status: 'provider_error' };
  if (receipt.status !== 'paid') return { status: 'not_paid' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const order = await client.query<{ id: string }>(
      `INSERT INTO purchase_orders (user_id, pack_id, channel, environment, amount_tomans, pack_display_name, status)
       VALUES ($1::uuid, $2, $3, 'production', $4, $5, 'fulfilled')
       RETURNING id`,
      [input.userId, packId, channelFor[input.provider], pack.amountTomans, pack.packName],
    );
    const orderId = order.rows[0].id;

    // No RIAL amount to echo: the store's verify API returns purchase state only, never a price.
    const event = await client.query<{ id: string }>(
      `INSERT INTO purchase_events (user_id, provider, environment, provider_purchase_id, pack_id, order_id, amount_tomans, status)
       VALUES ($1::uuid, $2::billing_provider, 'production', $3, $4, $5, $6, 'verified')
       ON CONFLICT (provider, provider_purchase_id) DO NOTHING
       RETURNING id`,
      [input.userId, input.provider, input.purchaseToken, packId, orderId, pack.amountTomans],
    );
    if (!event.rows[0]) {
      // Lost the race to a concurrent call with the same token: let that one own the grant.
      await client.query('ROLLBACK');
      const row = await pool.query<{ id: string }>(
        `SELECT id FROM purchase_events WHERE provider = $1::billing_provider AND provider_purchase_id = $2`,
        [input.provider, input.purchaseToken],
      );
      return { status: 'already_processed', purchaseId: row.rows[0]?.id ?? orderId };
    }
    const eventId = event.rows[0].id;

    const grant = await client.query(
      `INSERT INTO user_packs (user_id, pack_id, acquisition_type, purchase_event_id)
       VALUES ($1::uuid, $2, 'purchased', $3)
       ON CONFLICT (user_id, pack_id) DO NOTHING
       RETURNING user_id`,
      [input.userId, packId, eventId],
    );
    const alreadyEntitled = grant.rows.length === 0;

    // 'provider_callback' is reused deliberately: a store verify call IS the provider confirming
    // payment, the same role Zarinpal's redirect callback plays — no new source value needed.
    await client.query(
      `INSERT INTO purchase_order_events (order_id, kind, source) VALUES ($1, 'verified', 'provider_callback')`,
      [orderId],
    );

    await client.query('COMMIT');
    return { status: 'verified', purchaseId: eventId, packId, alreadyEntitled };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
