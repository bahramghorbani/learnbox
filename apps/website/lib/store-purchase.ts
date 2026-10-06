import type { Pool } from 'pg';

import { isLearnerUserId, storeCatalogueVisibilitySql } from './pack-access';
import { isZarinpalAuthority, type ZarinpalProvider } from './zarinpal';

/**
 * Canonical PAID pack acquisition (Phase 2 / M2.4).
 *
 * Two operations, and the split matters:
 *
 *   createPurchase — decides eligibility, snapshots the amount, opens a gateway session, records a
 *                    `pending` transaction. Grants nothing.
 *   verifyPurchase — asks the provider whether that session was actually paid, and ONLY on an
 *                    affirmative answer records the entitlement.
 *
 * A payment record is not an entitlement. `purchase_events` is a transaction log; `user_packs` is
 * the entitlement table the M2.2 access rule reads. The single statement in `grantVerified` below
 * is the only bridge between them, and it is reachable only after a successful provider
 * verification — never from a callback parameter.
 *
 * Provider specifics stay behind the injected `ZarinpalProvider`, so this file (and the pack-access
 * rule it imports from) contains no gateway protocol and no credential.
 */

/** Matches the pack id slug rule used across the Store. `packs.id` is text, never a uuid. */
const packIdPattern = /^[a-z0-9][a-z0-9-]{1,119}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PurchaseDenialReason =
  /** No such pack, or not published, or not listed. Indistinguishable on purpose. */
  | 'unavailable'
  /** A real offered pack, but free — it belongs to the M2.3 activation path, not this one. */
  | 'free_pack'
  /** The learner already holds this entitlement; charging again would be a double sale. */
  | 'already_owned';

export type CreatePurchaseOutcome =
  | { status: 'created'; purchaseId: string; redirectUrl: string; amountTomans: number }
  | { status: 'denied'; reason: PurchaseDenialReason }
  /** The gateway refused to open a session. Nothing was recorded. */
  | { status: 'provider_rejected'; code: number }
  /** The gateway was unreachable. Nothing was recorded; the learner may retry. */
  | { status: 'provider_error' };

export type VerifyPurchaseOutcome =
  | {
      status: 'verified';
      purchaseId: string;
      packId: string;
      amountTomans: number;
      referenceId: string | null;
      /** False when the entitlement already existed — a replay, still a success. */
      entitlementCreated: boolean;
    }
  /** The learner abandoned the gateway, or the gateway reported a non-OK return. */
  | { status: 'cancelled'; purchaseId: string }
  /** The provider authoritatively says this was not paid. */
  | { status: 'failed'; purchaseId: string; code: number }
  /**
   * We could not establish the outcome. The transaction stays `pending` and MUST NOT be presented
   * as a failure: the learner may have paid. Carries the internal id for reconciliation.
   */
  | { status: 'verification_error'; purchaseId: string }
  /** No transaction for this authority. A forged or expired callback. */
  | { status: 'unknown' };

export type PurchaseRecord = {
  purchaseId: string;
  packId: string;
  packName: string | null;
  amountTomans: number;
  status: string;
  referenceId: string | null;
  createdAt: string;
  verifiedAt: string | null;
};

type PurchaseDependencies = {
  pool: Pick<Pool, 'query'>;
  provider: ZarinpalProvider;
  /** Absolute https origin the gateway returns to. */
  callbackOrigin: string;
  sandbox: boolean;
};

/**
 * Eligibility and the amount come from ONE read of the canonical tables.
 *
 * The client supplies a pack id and nothing else. Price, free/paid state, publication state,
 * listing state and current ownership are all server-side facts — a client claiming a 1-toman
 * price, or claiming a draft pack is on sale, changes nothing here.
 */
async function readPurchasablePack(
  pool: Pick<Pool, 'query'>,
  userId: string,
  packId: string,
): Promise<
  { ok: true; amountTomans: number; packName: string } | { ok: false; reason: PurchaseDenialReason }
> {
  const result = await pool.query<{
    offered: boolean;
    is_free: boolean | null;
    price_tomans: number | null;
    display_name: string | null;
    owned: boolean;
  }>(
    `WITH offered AS (
       SELECT p.id, p.is_free, p.price_tomans, p.display_name
         FROM packs p
         JOIN store_listings sl ON sl.pack_id = p.id
        WHERE p.id = $2 AND ${storeCatalogueVisibilitySql('p', 'sl')}
     )
     SELECT EXISTS (SELECT 1 FROM offered) AS offered,
            (SELECT is_free FROM offered)      AS is_free,
            (SELECT price_tomans FROM offered) AS price_tomans,
            (SELECT display_name FROM offered) AS display_name,
            EXISTS (
              SELECT 1 FROM user_packs
               WHERE user_id = $1::uuid AND pack_id = $2
            ) AS owned`,
    [userId, packId],
  );

  const row = result.rows[0];
  if (!row || !row.offered) return { ok: false, reason: 'unavailable' };
  if (row.owned) return { ok: false, reason: 'already_owned' };
  if (row.is_free) return { ok: false, reason: 'free_pack' };
  // A paid pack with no usable price is a configuration error, not something to charge for.
  if (!Number.isSafeInteger(row.price_tomans) || (row.price_tomans ?? 0) <= 0) {
    return { ok: false, reason: 'unavailable' };
  }
  return {
    ok: true,
    amountTomans: row.price_tomans as number,
    packName: row.display_name ?? packId,
  };
}

export async function createPurchase(
  dependencies: PurchaseDependencies,
  input: { userId: string; packId: string },
): Promise<CreatePurchaseOutcome> {
  const { pool, provider, callbackOrigin, sandbox } = dependencies;
  if (!isLearnerUserId(input.userId)) return { status: 'denied', reason: 'unavailable' };
  if (typeof input.packId !== 'string' || !packIdPattern.test(input.packId)) {
    return { status: 'denied', reason: 'unavailable' };
  }

  const pack = await readPurchasablePack(pool, input.userId, input.packId);
  if (!pack.ok) return { status: 'denied', reason: pack.reason };

  // The gateway session is opened BEFORE anything is written, because the Authority it returns is
  // the transaction's provider key. If the write below fails, the learner simply never completes an
  // unpaid session — the opposite order would leave a payable row with no gateway session.
  const requested = await provider.requestPayment({
    amountTomans: pack.amountTomans,
    callbackUrl: `${callbackOrigin}/api/store/purchase/callback`,
    // Commercial presentation only. Never pack contents.
    description: `خرید بستهٔ ${pack.packName}`,
  });
  if (requested.status === 'error') return { status: 'provider_error' };
  if (requested.status === 'rejected') {
    return { status: 'provider_rejected', code: requested.code };
  }

  // `amount_tomans` is written once, here, and is never recomputed. Verification sends this value
  // back to the gateway, so an operator changing `packs.price_tomans` while the learner is on the
  // payment page cannot invalidate a correctly-made payment.
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO purchase_events
       (user_id, provider, environment, provider_purchase_id, pack_id, amount_tomans, status)
     VALUES ($1::uuid, 'zarinpal', $2::billing_environment, $3, $4, $5, 'pending')
     RETURNING id`,
    [
      input.userId,
      sandbox ? 'sandbox' : 'production',
      requested.authority,
      input.packId,
      pack.amountTomans,
    ],
  );

  return {
    status: 'created',
    purchaseId: inserted.rows[0].id,
    redirectUrl: provider.paymentUrl(requested.authority),
    amountTomans: pack.amountTomans,
  };
}

/**
 * Records a verified payment and grants the entitlement in ONE statement.
 *
 * `status = 'pending'` inside the UPDATE is the idempotency lock. Two concurrent callbacks for the
 * same Authority serialise on the row; the first flips it to `verified`, the second matches nothing
 * and therefore neither updates the transaction nor inserts an entitlement. A replayed callback
 * minutes later is the same story. `ON CONFLICT DO NOTHING` covers the remaining case where the
 * learner somehow already holds the pack, so there is exactly one entitlement per learner and pack
 * no matter how many times this runs.
 */
async function grantVerified(
  pool: Pick<Pool, 'query'>,
  purchaseId: string,
  referenceId: string,
): Promise<{ updated: boolean; entitlementCreated: boolean }> {
  const result = await pool.query<{ updated: boolean; granted: boolean }>(
    `WITH updated AS (
       UPDATE purchase_events
          SET status = 'verified',
              provider_reference = $2,
              verified_at = now(),
              updated_at = now()
        WHERE id = $1::uuid
          AND status = 'pending'
       RETURNING id, user_id, pack_id
     ),
     granted AS (
       INSERT INTO user_packs (user_id, pack_id, acquisition_type, purchase_event_id)
       SELECT user_id, pack_id, 'purchased', id FROM updated
       ON CONFLICT (user_id, pack_id) DO NOTHING
       RETURNING pack_id
     )
     SELECT EXISTS (SELECT 1 FROM updated) AS updated,
            EXISTS (SELECT 1 FROM granted) AS granted`,
    [purchaseId, referenceId],
  );
  const row = result.rows[0];
  return { updated: Boolean(row?.updated), entitlementCreated: Boolean(row?.granted) };
}

async function markTerminal(
  pool: Pick<Pool, 'query'>,
  purchaseId: string,
  status: 'failed' | 'cancelled',
): Promise<void> {
  // Guarded by `status = 'pending'` too, so a late non-OK callback can never undo a verified sale.
  await pool.query(
    `UPDATE purchase_events
        SET status = $2::purchase_status, updated_at = now()
      WHERE id = $1::uuid AND status = 'pending'`,
    [purchaseId, status],
  );
}

/**
 * Settles a gateway return.
 *
 * The callback's query parameters are treated as a HINT, never as proof: a non-OK status short-
 * circuits to cancelled (there is nothing to verify), but an OK status grants nothing by itself —
 * the provider is asked directly, with the stored amount, and only its answer decides. A forged
 * `Status=OK&Authority=...` for an unknown authority resolves to `unknown`; for a real pending
 * authority it resolves to whatever the provider says, which for an unpaid session is `failed`.
 *
 * Deliberately ignores the caller's session. The entitlement goes to `purchase_events.user_id`,
 * the learner who started the purchase, so a second learner replaying someone else's callback URL
 * cannot acquire the pack — they would only settle the original buyer's transaction.
 */
export async function verifyPurchase(
  dependencies: Pick<PurchaseDependencies, 'pool' | 'provider'>,
  input: { authority: string; callbackStatus: string | null },
  /** Internal: bounds the single re-read below so a lost update race cannot loop. */
  attempt = 0,
): Promise<VerifyPurchaseOutcome> {
  const { pool, provider } = dependencies;
  if (!isZarinpalAuthority(input.authority)) return { status: 'unknown' };

  const found = await pool.query<{
    id: string;
    pack_id: string;
    amount_tomans: number;
    status: string;
    provider_reference: string | null;
  }>(
    `SELECT id, pack_id, amount_tomans, status, provider_reference
       FROM purchase_events
      WHERE provider = 'zarinpal' AND provider_purchase_id = $1`,
    [input.authority],
  );
  const row = found.rows[0];
  if (!row) return { status: 'unknown' };

  const base = { purchaseId: row.id, packId: row.pack_id, amountTomans: row.amount_tomans };

  // Already settled. Report the recorded outcome and touch nothing — this is what makes a replayed
  // success a success without a second entitlement, and a replayed failure still a failure.
  if (row.status === 'verified') {
    return {
      status: 'verified',
      ...base,
      referenceId: row.provider_reference,
      entitlementCreated: false,
    };
  }
  if (row.status === 'cancelled') return { status: 'cancelled', purchaseId: row.id };
  if (row.status !== 'pending') return { status: 'failed', purchaseId: row.id, code: 0 };

  // Zarinpal sends Status=NOK when the learner cancels or the payment never completed. There is no
  // payment to verify, so this is settled locally.
  if (input.callbackStatus !== 'OK') {
    await markTerminal(pool, row.id, 'cancelled');
    return { status: 'cancelled', purchaseId: row.id };
  }

  const verification = await provider.verifyPayment({
    amountTomans: row.amount_tomans,
    authority: input.authority,
  });

  if (verification.status === 'error') {
    // Outcome unknown: stay `pending`, grant nothing, claim nothing. Reconcilable by internal id.
    return { status: 'verification_error', purchaseId: row.id };
  }
  if (verification.status === 'rejected') {
    await markTerminal(pool, row.id, 'failed');
    return { status: 'failed', purchaseId: row.id, code: verification.code };
  }

  const granted = await grantVerified(pool, row.id, verification.referenceId);
  if (!granted.updated) {
    // A concurrent callback settled it first. Re-read once rather than assume which way it went;
    // the row is no longer `pending`, so that read terminates in a settled branch above.
    if (attempt === 0) return verifyPurchase(dependencies, input, 1);
    return { status: 'verification_error', purchaseId: row.id };
  }
  return {
    status: 'verified',
    ...base,
    referenceId: verification.referenceId,
    entitlementCreated: granted.entitlementCreated,
  };
}

/**
 * One transaction, for the learner who owns it.
 *
 * The `user_id` predicate is the ownership boundary: another learner asking for this id gets null,
 * not a receipt with someone else's pack and amount on it.
 */
export async function readPurchaseForLearner(
  pool: Pick<Pool, 'query'>,
  userId: string,
  purchaseId: string,
): Promise<PurchaseRecord | null> {
  if (!isLearnerUserId(userId) || !uuidPattern.test(purchaseId)) return null;
  const result = await pool.query<{
    id: string;
    pack_id: string;
    display_name: string | null;
    amount_tomans: number;
    status: string;
    provider_reference: string | null;
    created_at: Date;
    verified_at: Date | null;
  }>(
    `SELECT pe.id, pe.pack_id, p.display_name, pe.amount_tomans, pe.status,
            pe.provider_reference, pe.created_at, pe.verified_at
       FROM purchase_events pe
       LEFT JOIN packs p ON p.id = pe.pack_id
      WHERE pe.id = $2::uuid AND pe.user_id = $1::uuid AND pe.pack_id IS NOT NULL`,
    [userId, purchaseId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    purchaseId: row.id,
    packId: row.pack_id,
    packName: row.display_name,
    amountTomans: row.amount_tomans,
    status: row.status,
    referenceId: row.provider_reference,
    createdAt: row.created_at.toISOString(),
    verifiedAt: row.verified_at ? row.verified_at.toISOString() : null,
  };
}
