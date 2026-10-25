import type { Pool } from 'pg';

/**
 * Daily review-reminder push subscriptions (LB-B19 made real).
 *
 * One row per learner: the browser's PushSubscription (endpoint + keys) plus whether reminders
 * are currently on. `enabled=false` keeps the row (instead of deleting it) so re-enabling from
 * Settings does not require the browser to go through permission + subscribe again when the
 * existing subscription is still valid.
 */

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/** Validates the shape the browser's PushSubscription.toJSON() actually produces. */
export function parsePushSubscription(body: unknown): PushSubscriptionKeys | null {
  if (!body || typeof body !== 'object') return null;
  const input = body as Record<string, unknown>;
  const endpoint = input.endpoint;
  const keys = input.keys;
  if (!isNonEmptyString(endpoint) || !endpoint.startsWith('https://')) return null;
  if (!keys || typeof keys !== 'object') return null;
  const { p256dh, auth } = keys as Record<string, unknown>;
  if (!isNonEmptyString(p256dh) || !isNonEmptyString(auth)) return null;
  return { endpoint, p256dh, auth };
}

/** Settings → turning the toggle on: saves (or replaces) the subscription and enables it. */
export async function saveReminderSubscription(
  pool: Pick<Pool, 'query'>,
  userId: string,
  subscription: PushSubscriptionKeys,
): Promise<void> {
  await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, enabled, updated_at)
     VALUES ($1, $2, $3, $4, true, now())
     ON CONFLICT (user_id) DO UPDATE SET
       endpoint = EXCLUDED.endpoint,
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth,
       enabled = true,
       updated_at = now()`,
    [userId, subscription.endpoint, subscription.p256dh, subscription.auth],
  );
}

/** Settings → turning the toggle off. The row (and subscription) stays, just inactive. */
export async function disableReminderSubscription(
  pool: Pick<Pool, 'query'>,
  userId: string,
): Promise<void> {
  await pool.query(
    `UPDATE push_subscriptions SET enabled = false, updated_at = now() WHERE user_id = $1`,
    [userId],
  );
}

/** What Settings shows: whether this learner currently has reminders on. */
export async function readReminderStatus(
  pool: Pick<Pool, 'query'>,
  userId: string,
): Promise<{ enabled: boolean }> {
  const result = await pool.query<{ enabled: boolean }>(
    `SELECT enabled FROM push_subscriptions WHERE user_id = $1`,
    [userId],
  );
  return { enabled: result.rows[0]?.enabled ?? false };
}
