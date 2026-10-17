import type { Pool } from 'pg';

import { isLearnerUserId, storeCatalogueVisibilitySql } from './pack-access';
import { isZarinpalAuthority, tomansToRials, type ZarinpalProvider } from './zarinpal';

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
 * A payment record is not an entitlement. `purchase_orders` is the learner's intent (one open
 * order per learner and pack, immutable price snapshot); `purchase_events` is one gateway attempt
 * within it; `user_packs` is the entitlement the M2.2 access rule reads. The transaction in
 * `grantVerified` is the only bridge to `user_packs`, reachable only after a successful provider
 * verification — never from a callback parameter. Contract: docs/architecture/COMMERCE_CORE_CONTRACT.md.
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
  | {
      status: 'created';
      purchaseId: string;
      orderCode: string;
      redirectUrl: string;
      amountTomans: number;
      /** True when a still-valid pending attempt was returned instead of opening a new one. */
      reused: boolean;
    }
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
      /** Set when this payment could not create a new entitlement and needs operator review. */
      reviewReason?: 'already_entitled';
    }
  /** The learner abandoned the gateway, or the gateway reported a non-OK return. */
  | { status: 'cancelled'; purchaseId: string }
  /** The provider authoritatively says this was not paid. */
  | { status: 'failed'; purchaseId: string; code: number }
  /**
   * We could not establish the outcome (transport error, an inconclusive provider code, or a
   * response that failed the §3.1 checks). The attempt is not failed and MUST NOT be presented as
   * a failure: the learner may have paid. Reconciliation re-checks it.
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
  orderCode: string | null;
  createdAt: string;
  verifiedAt: string | null;
};

export type CheckSource =
  'provider_callback' | 'learner_status' | 'reconciliation' | 'admin_recheck';

type Queryable = Pick<Pool, 'query'>;
type PurchaseDependencies = {
  /** `connect` is used for the order lock and the grant transaction. */
  pool: Pick<Pool, 'query' | 'connect'>;
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

/** A pending attempt younger than this is handed back instead of opening a second gateway session. */
const attemptReuseWindow = '20 minutes';
/** An open order older than this is expired and replaced, so an abandoned one never blocks. */
const orderLifetime = '24 hours';
/** Zarinpal -51 = "not an active paid try". Only this code is allowed to fail an attempt. */
const codeNotPaid = -51;
/**
 * Provider answers that say nothing final about THIS attempt: 0 = unreadable body, -12 = rate
 * limited. Retried automatically like a network error. Every other rejection (-50 amount differs,
 * -53 other merchant, -54 invalid Authority, -55 not found, ...) is a definitive answer that is
 * neither paid nor not-paid: flagged `provider_rejected` for review and NOT retried automatically.
 */
const transientCodes = new Set([0, -12]);
/**
 * Automatic checks per attempt before reconciliation stops and the attempt waits for review
 * (≈ 3 h of 10-minute runs). Mirrored in apps/admin postgres-admin-payments-store.ts `auto_check`.
 */
export const maxAutomaticChecks = 20;

async function recordEvent(
  db: Queryable,
  orderId: string,
  attemptId: string | null,
  kind: string,
  source: CheckSource | 'learner_initiate',
  providerCode: number | null = null,
): Promise<void> {
  await db.query(
    `INSERT INTO purchase_order_events (order_id, attempt_id, kind, source, provider_code)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5)`,
    [orderId, attemptId, kind, source, providerCode],
  );
}

/**
 * Opens (or reuses) the learner's order and attempt for one pack.
 *
 * Concurrency: the open order row is locked FOR UPDATE for the whole call, including the gateway
 * request, so parallel tabs, double clicks and client retries serialise on it. The second caller
 * then finds the first caller's fresh pending attempt and receives the SAME gateway session
 * instead of a second payable one. A stale order (price changed, or older than `orderLifetime`) is
 * expired first, so nothing blocks the learner beyond the gateway session window.
 */
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
  const environment = sandbox ? 'sandbox' : 'production';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const expired = await client.query<{ id: string }>(
      `UPDATE purchase_orders SET status = 'expired', updated_at = now()
        WHERE user_id = $1::uuid AND pack_id = $2 AND status = 'open'
          AND (amount_tomans <> $3 OR environment <> $4::billing_environment
               OR created_at < now() - $5::interval)
      RETURNING id`,
      [input.userId, input.packId, pack.amountTomans, environment, orderLifetime],
    );
    for (const row of expired.rows) {
      await recordEvent(client, row.id, null, 'order_expired', 'learner_initiate');
    }
    const opened = await client.query<{ id: string }>(
      `INSERT INTO purchase_orders
         (user_id, pack_id, environment, amount_tomans, pack_display_name, snapshot)
       VALUES ($1::uuid, $2, $3::billing_environment, $4, $5,
               jsonb_build_object('target_item_count',
                 (SELECT target_item_count FROM packs WHERE id = $2), 'price_source', 'packs.price_tomans'))
       ON CONFLICT (user_id, pack_id) WHERE status = 'open' DO NOTHING
       RETURNING id`,
      [input.userId, input.packId, environment, pack.amountTomans, pack.packName],
    );
    const order = (
      await client.query<{ id: string; public_code: string; amount_tomans: number }>(
        `SELECT id, public_code, amount_tomans FROM purchase_orders
          WHERE user_id = $1::uuid AND pack_id = $2 AND status = 'open'
          FOR UPDATE`,
        [input.userId, input.packId],
      )
    ).rows[0];
    if (!order) throw new Error('open purchase order vanished under lock');
    if (opened.rows[0])
      await recordEvent(client, order.id, null, 'order_opened', 'learner_initiate');

    const reusable = (
      await client.query<{ id: string; provider_purchase_id: string }>(
        `SELECT id, provider_purchase_id FROM purchase_events
          WHERE order_id = $1::uuid AND status = 'pending'
            AND created_at > now() - $2::interval
          ORDER BY created_at DESC LIMIT 1`,
        [order.id, attemptReuseWindow],
      )
    ).rows[0];
    if (reusable) {
      await recordEvent(client, order.id, reusable.id, 'attempt_reused', 'learner_initiate');
      await client.query('COMMIT');
      return {
        status: 'created',
        purchaseId: reusable.id,
        orderCode: order.public_code,
        redirectUrl: provider.paymentUrl(reusable.provider_purchase_id),
        amountTomans: order.amount_tomans,
        reused: true,
      };
    }

    // Converted ONCE, here. The rial amount is stored on the attempt and sent back unchanged by
    // every verification, so a later price change cannot invalidate a payment already made.
    const amountRials = tomansToRials(order.amount_tomans);
    const requested = await provider.requestPayment({
      amountRials,
      callbackUrl: `${callbackOrigin}/api/store/purchase/callback`,
      // Commercial presentation only. Never pack contents.
      description: `خرید بستهٔ ${pack.packName}`,
      orderCode: order.public_code,
    });
    if (requested.status !== 'created') {
      // The order (if new) is kept; it is the learner's intent and the next retry reuses it.
      await client.query('COMMIT');
      return requested.status === 'error'
        ? { status: 'provider_error' }
        : { status: 'provider_rejected', code: requested.code };
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO purchase_events
         (user_id, provider, environment, provider_purchase_id, pack_id, amount_tomans, status,
          order_id, provider_amount, provider_currency)
       VALUES ($1::uuid, 'zarinpal', $2::billing_environment, $3, $4, $5, 'pending',
               $6::uuid, $7, 'IRR')
       RETURNING id`,
      [
        input.userId,
        environment,
        requested.authority,
        input.packId,
        order.amount_tomans,
        order.id,
        amountRials,
      ],
    );
    await recordEvent(client, order.id, inserted.rows[0].id, 'attempt_created', 'learner_initiate');
    await client.query('COMMIT');
    return {
      status: 'created',
      purchaseId: inserted.rows[0].id,
      orderCode: order.public_code,
      redirectUrl: provider.paymentUrl(requested.authority),
      amountTomans: order.amount_tomans,
      reused: false,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Records a verified payment, grants the entitlement and projects the order — one transaction.
 *
 * The status guard in the UPDATE is the idempotency lock: concurrent verifications of the same
 * attempt serialise on its row and only the first flips it. If anything after that fails (for
 * example the entitlement insert), the whole transaction rolls back and the attempt stays
 * unsettled, so the next verification (callback replay, status poll, reconciliation) receives
 * Zarinpal's 101 and grants exactly once — no new charge, no lost payment.
 *
 * A verified payment that cannot create an entitlement because the learner already holds the pack
 * is still recorded under its own attempt id, flagged `already_entitled`, and its order is marked
 * `needs_review` unless another attempt already fulfilled it. No automatic refund.
 */
async function grantVerified(
  pool: Pick<Pool, 'connect'>,
  purchaseId: string,
  referenceId: string,
  providerCode: number | null,
  source: CheckSource,
): Promise<{ updated: boolean; entitlementCreated: boolean }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = (
      await client.query<{ user_id: string; pack_id: string; order_id: string | null }>(
        `UPDATE purchase_events
            SET status = 'verified', provider_reference = $2, verified_at = now(),
                updated_at = now(), last_checked_at = now(), check_count = check_count + 1,
                last_provider_code = $3, review_reason = NULL
          WHERE id = $1::uuid AND status IN ('pending', 'cancelled', 'failed')
        RETURNING user_id, pack_id, order_id`,
        [purchaseId, referenceId, providerCode],
      )
    ).rows[0];
    if (!updated) {
      await client.query('ROLLBACK');
      return { updated: false, entitlementCreated: false };
    }
    const granted =
      ((
        await client.query(
          `INSERT INTO user_packs (user_id, pack_id, acquisition_type, purchase_event_id)
           VALUES ($1::uuid, $2, 'purchased', $3::uuid)
           ON CONFLICT (user_id, pack_id) DO NOTHING`,
          [updated.user_id, updated.pack_id, purchaseId],
        )
      ).rowCount ?? 0) > 0;
    if (!granted) {
      await client.query(
        `UPDATE purchase_events SET review_reason = 'already_entitled' WHERE id = $1::uuid`,
        [purchaseId],
      );
    }
    if (updated.order_id) {
      await client.query(
        `UPDATE purchase_orders
            SET status = CASE WHEN $2 OR status = 'fulfilled' THEN 'fulfilled' ELSE 'needs_review' END,
                updated_at = now()
          WHERE id = $1::uuid`,
        [updated.order_id, granted],
      );
      await recordEvent(
        client,
        updated.order_id,
        purchaseId,
        granted ? 'verified' : 'already_entitled',
        source,
        providerCode,
      );
    }
    await client.query('COMMIT');
    return { updated: true, entitlementCreated: granted };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Records a non-verifying outcome on an attempt, guarded by its current status so a late caller
 * can never undo a settled payment. Returns false when the guard matched nothing.
 */
async function noteAttempt(
  pool: Queryable,
  row: { id: string; order_id: string | null; status: string },
  change: {
    kind: string;
    source: CheckSource;
    providerCode?: number | null;
    /** Whether the provider was actually asked (feeds reconciliation throttling). */
    checked: boolean;
    status?: 'failed' | 'cancelled';
    reviewReason?: 'provider_mismatch' | 'provider_rejected';
  },
): Promise<boolean> {
  const result = await pool.query<{ changed: number }>(
    `WITH changed AS (
       UPDATE purchase_events
          SET status = COALESCE($2::purchase_status, status),
              last_checked_at = CASE WHEN $3 THEN now() ELSE last_checked_at END,
              check_count = check_count + CASE WHEN $3 THEN 1 ELSE 0 END,
              last_provider_code = COALESCE($4, last_provider_code),
              review_reason = COALESCE($5, review_reason),
              updated_at = now()
        WHERE id = $1::uuid AND status = $6::purchase_status
       RETURNING id, order_id
     ), logged AS (
       INSERT INTO purchase_order_events (order_id, attempt_id, kind, source, provider_code)
       SELECT order_id, id, $7, $8, $4 FROM changed WHERE order_id IS NOT NULL
     )
     SELECT count(*)::int AS changed FROM changed`,
    [
      row.id,
      change.status ?? null,
      change.checked,
      change.providerCode ?? null,
      change.reviewReason ?? null,
      row.status,
      change.kind,
      change.source,
    ],
  );
  return (result.rows[0]?.changed ?? 0) > 0;
}

/**
 * Settles one attempt by asking the provider.
 *
 * The callback's query parameters are a HINT, never proof. `Status=NOK` marks a pending attempt
 * `cancelled` locally without calling the gateway — but `cancelled` is not final: a later OK
 * callback, a status poll or reconciliation still verifies it, so a forged NOK cannot destroy a
 * real payment. `Status=OK` (and every non-callback source) asks Zarinpal with the stored rial
 * amount; only its answer decides, and only `-51` may fail the attempt.
 *
 * Deliberately ignores the caller's session. The entitlement goes to `purchase_events.user_id`.
 */
export async function verifyPurchase(
  dependencies: Pick<PurchaseDependencies, 'pool' | 'provider'>,
  input: { authority: string; callbackStatus: string | null; source?: CheckSource },
  /** Internal: bounds the single re-read below so a lost update race cannot loop. */
  attempt = 0,
): Promise<VerifyPurchaseOutcome> {
  const { pool, provider } = dependencies;
  const source = input.source ?? 'provider_callback';
  if (!isZarinpalAuthority(input.authority)) return { status: 'unknown' };

  const found = await pool.query<{
    id: string;
    order_id: string | null;
    pack_id: string;
    amount_tomans: number;
    provider_amount: string | null;
    status: string;
    provider_reference: string | null;
    review_reason: string | null;
    public_code: string | null;
    old_enough_to_fail: boolean;
  }>(
    `SELECT pe.id, pe.order_id, pe.pack_id, pe.amount_tomans, pe.provider_amount::text,
            pe.status, pe.provider_reference, pe.review_reason, po.public_code,
            pe.created_at < now() - interval '30 minutes' AS old_enough_to_fail
       FROM purchase_events pe
       LEFT JOIN purchase_orders po ON po.id = pe.order_id
      WHERE pe.provider = 'zarinpal' AND pe.provider_purchase_id = $1`,
    [input.authority],
  );
  const row = found.rows[0];
  if (!row) return { status: 'unknown' };

  const base = { purchaseId: row.id, packId: row.pack_id, amountTomans: row.amount_tomans };
  const retry = () => verifyPurchase(dependencies, input, 1);

  // Already settled. Report the recorded outcome and touch nothing — a replayed success stays a
  // success without a second entitlement, and the gateway is not asked again.
  if (row.status === 'verified') {
    return {
      status: 'verified',
      ...base,
      referenceId: row.provider_reference,
      entitlementCreated: false,
      ...(row.review_reason === 'already_entitled' ? { reviewReason: 'already_entitled' } : {}),
    };
  }
  const callbackOk = source !== 'provider_callback' || input.callbackStatus === 'OK';
  if (row.status === 'failed' && source !== 'reconciliation' && source !== 'admin_recheck') {
    return { status: 'failed', purchaseId: row.id, code: codeNotPaid };
  }
  if (!['pending', 'cancelled', 'failed'].includes(row.status)) {
    return { status: 'failed', purchaseId: row.id, code: 0 };
  }

  if (!callbackOk) {
    if (row.status === 'pending') {
      const changed = await noteAttempt(pool, row, {
        kind: 'cancelled',
        source,
        checked: false,
        status: 'cancelled',
      });
      // Changed nothing: a concurrent caller settled it. Report what is recorded.
      if (!changed && attempt === 0) return retry();
    }
    return { status: 'cancelled', purchaseId: row.id };
  }

  // Only ever the stored amount of an attempt LearnBox created (never re-derived from the price).
  const amountRials = Number(row.provider_amount);
  if (!Number.isSafeInteger(amountRials) || amountRials <= 0) {
    return { status: 'verification_error', purchaseId: row.id };
  }
  const verification = await provider.verifyPayment({ amountRials, authority: input.authority });

  if (verification.status === 'error') {
    await noteAttempt(pool, row, { kind: 'check_unresolved', source, checked: true });
    return { status: 'verification_error', purchaseId: row.id };
  }
  if (verification.status === 'rejected') {
    const mayFail =
      verification.code === codeNotPaid &&
      (row.old_enough_to_fail || (source === 'provider_callback' && input.callbackStatus === 'OK'));
    if (mayFail) {
      if (row.status === 'failed') {
        await noteAttempt(pool, row, {
          kind: 'failed',
          source,
          checked: true,
          providerCode: verification.code,
        });
        return { status: 'failed', purchaseId: row.id, code: verification.code };
      }
      const changed = await noteAttempt(pool, row, {
        kind: 'failed',
        source,
        checked: true,
        status: 'failed',
        providerCode: verification.code,
      });
      if (!changed && attempt === 0) return retry();
      return { status: 'failed', purchaseId: row.id, code: verification.code };
    }
    // Neither proves whether the learner paid, so the attempt stays open (never `failed`). A
    // transient answer is retried; a definitive one (-50, -54, ...) stops automatic retries and is
    // flagged for review with its exact code.
    // A young -51 only means "not paid yet" (the learner may still be on the gateway page).
    const transient = transientCodes.has(verification.code) || verification.code === codeNotPaid;
    await noteAttempt(pool, row, {
      kind: transient ? 'check_unresolved' : 'provider_rejected',
      source,
      checked: true,
      providerCode: verification.code,
      ...(transient ? {} : { reviewReason: 'provider_rejected' as const }),
    });
    return row.status === 'cancelled'
      ? { status: 'cancelled', purchaseId: row.id }
      : { status: 'verification_error', purchaseId: row.id };
  }

  // §3.1: 100/101 counts only together with the attempt's own data. The request/verify pair is
  // already bound to an Authority we created and its stored amount; an echoed order code, when
  // the gateway returns one, must be ours.
  if (verification.orderCode !== undefined && verification.orderCode !== row.public_code) {
    await noteAttempt(pool, row, {
      kind: 'provider_mismatch',
      source,
      checked: true,
      providerCode: verification.code ?? null,
      reviewReason: 'provider_mismatch',
    });
    return { status: 'verification_error', purchaseId: row.id };
  }

  const granted = await grantVerified(
    pool,
    row.id,
    verification.referenceId,
    verification.code ?? null,
    source,
  );
  if (!granted.updated) {
    // A concurrent caller settled it first. Re-read once rather than assume which way it went.
    if (attempt === 0) return retry();
    return { status: 'verification_error', purchaseId: row.id };
  }
  return {
    status: 'verified',
    ...base,
    referenceId: verification.referenceId,
    entitlementCreated: granted.entitlementCreated,
    ...(granted.entitlementCreated ? {} : { reviewReason: 'already_entitled' as const }),
  };
}

/**
 * Re-checks attempts nobody returned for (limited reconciliation, contract §4).
 *
 * Candidates: attempts with no review flag and fewer than `maxAutomaticChecks` checks that are
 * pending between 30 minutes and 7 days old and not checked in the last 10 minutes, or cancelled
 * under 24 hours and never re-checked; plus any pending/cancelled/failed attempt with an Admin
 * re-check request newer than its last check (this is the ONLY consumer of those requests).
 * Bounded per run.
 */
export async function reconcilePurchases(
  dependencies: Pick<PurchaseDependencies, 'pool' | 'provider'>,
  options: { limit?: number } = {},
): Promise<{ checked: number; verified: number }> {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const { rows } = await dependencies.pool.query<{ authority: string; requested: boolean }>(
    `SELECT pe.provider_purchase_id AS authority,
            EXISTS (SELECT 1 FROM purchase_order_events e
                     WHERE e.attempt_id = pe.id AND e.kind = 'recheck_requested'
                       AND e.created_at > COALESCE(pe.last_checked_at, '-infinity')) AS requested
       FROM purchase_events pe
      WHERE pe.provider = 'zarinpal' AND pe.order_id IS NOT NULL
        AND (
          (pe.review_reason IS NULL AND pe.check_count < $2 AND (
            (pe.status = 'pending' AND pe.created_at < now() - interval '30 minutes'
               AND pe.created_at > now() - interval '7 days'
               AND COALESCE(pe.last_checked_at, '-infinity') < now() - interval '10 minutes')
            OR (pe.status = 'cancelled' AND pe.created_at > now() - interval '24 hours'
               AND pe.last_checked_at IS NULL)))
          OR (pe.status IN ('pending', 'cancelled', 'failed') AND EXISTS (
               SELECT 1 FROM purchase_order_events e
                WHERE e.attempt_id = pe.id AND e.kind = 'recheck_requested'
                  AND e.created_at > COALESCE(pe.last_checked_at, '-infinity')))
        )
      ORDER BY pe.created_at
      LIMIT $1`,
    [limit, maxAutomaticChecks],
  );
  let verified = 0;
  for (const row of rows) {
    const outcome = await verifyPurchase(dependencies, {
      authority: row.authority,
      callbackStatus: null,
      source: row.requested ? 'admin_recheck' : 'reconciliation',
    });
    if (outcome.status === 'verified') verified += 1;
  }
  return { checked: rows.length, verified };
}

/**
 * The learner's own unsettled attempt, re-checked at most once a minute from the status endpoint,
 * so a learner whose callback never arrived sees the truth without waiting for reconciliation.
 */
export async function refreshPurchaseForLearner(
  dependencies: Pick<PurchaseDependencies, 'pool' | 'provider'>,
  userId: string,
  purchaseId: string,
): Promise<PurchaseRecord | null> {
  if (!isLearnerUserId(userId) || !uuidPattern.test(purchaseId)) return null;
  const due = await dependencies.pool.query<{ authority: string }>(
    `SELECT provider_purchase_id AS authority FROM purchase_events
      WHERE id = $2::uuid AND user_id = $1::uuid AND provider = 'zarinpal'
        AND order_id IS NOT NULL AND status IN ('pending', 'cancelled')
        AND review_reason IS NULL AND check_count < $3
        AND created_at > now() - interval '7 days'
        AND COALESCE(last_checked_at, '-infinity') < now() - interval '1 minute'`,
    [userId, purchaseId, maxAutomaticChecks],
  );
  if (due.rows[0]) {
    await verifyPurchase(dependencies, {
      authority: due.rows[0].authority,
      callbackStatus: null,
      source: 'learner_status',
    });
  }
  return readPurchaseForLearner(dependencies.pool, userId, purchaseId);
}

/**
 * One transaction, for the learner who owns it.
 *
 * The `user_id` predicate is the ownership boundary: another learner asking for this id gets null,
 * not a receipt with someone else's pack and amount on it.
 */
export async function readPurchaseForLearner(
  pool: Queryable,
  userId: string,
  purchaseId: string,
): Promise<PurchaseRecord | null> {
  if (!isLearnerUserId(userId) || !uuidPattern.test(purchaseId)) return null;
  const result = await pool.query<LearnerPurchaseRow>(
    `${learnerPurchaseSelect}
      WHERE pe.id = $2::uuid AND pe.user_id = $1::uuid AND pe.pack_id IS NOT NULL`,
    [userId, purchaseId],
  );
  const row = result.rows[0];
  return row ? toPurchaseRecord(row) : null;
}

/** «خریدهای من»: the learner's own pack payment attempts, newest first. Commercial facts only. */
export async function readLearnerPurchases(
  pool: Queryable,
  userId: string,
): Promise<PurchaseRecord[]> {
  if (!isLearnerUserId(userId)) return [];
  const result = await pool.query<LearnerPurchaseRow>(
    `${learnerPurchaseSelect}
      WHERE pe.user_id = $1::uuid AND pe.pack_id IS NOT NULL
      ORDER BY pe.created_at DESC
      LIMIT 50`,
    [userId],
  );
  return result.rows.map(toPurchaseRecord);
}

type LearnerPurchaseRow = {
  id: string;
  pack_id: string;
  display_name: string | null;
  amount_tomans: number;
  status: string;
  provider_reference: string | null;
  public_code: string | null;
  created_at: Date;
  verified_at: Date | null;
};

// The name the learner bought (order snapshot) wins over the current catalogue name.
const learnerPurchaseSelect = `SELECT pe.id, pe.pack_id, COALESCE(po.pack_display_name, p.display_name) AS display_name,
            pe.amount_tomans, pe.status::text AS status, pe.provider_reference, po.public_code,
            pe.created_at, pe.verified_at
       FROM purchase_events pe
       LEFT JOIN purchase_orders po ON po.id = pe.order_id
       LEFT JOIN packs p ON p.id = pe.pack_id`;

function toPurchaseRecord(row: LearnerPurchaseRow): PurchaseRecord {
  return {
    purchaseId: row.id,
    packId: row.pack_id,
    packName: row.display_name,
    amountTomans: row.amount_tomans,
    status: row.status,
    referenceId: row.provider_reference,
    orderCode: row.public_code,
    createdAt: row.created_at.toISOString(),
    verifiedAt: row.verified_at ? row.verified_at.toISOString() : null,
  };
}
