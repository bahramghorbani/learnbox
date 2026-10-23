/**
 * Daily review-reminder sender (LB-B19 made real).
 *
 * Meant to run once a day from a systemd timer on the production host (same pattern as the
 * backup/restore-drill timers): `node dist/send-daily-reminders.js`. One pass:
 *  - selects every push_subscriptions row with enabled = true,
 *  - runs it through the existing `decideNotification` policy (category daily_review, at most
 *    once per calendar day — `sentToday` comes from last_sent_date, not a separate counter),
 *  - sends via Web Push (VAPID) with one of the 15 approved motivational sentences,
 *  - on a 404/410 (the browser revoked the subscription) disables the row instead of retrying
 *    forever,
 *  - stamps last_sent_date so the next run today is a no-op for this user.
 */
import { Pool } from 'pg';
import webpush from 'web-push';

import { decideNotification } from './policy.js';
import { pickRandomSentence } from './sentences.js';

interface SubscriptionRow {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  last_sent_date: string | null;
}

export interface SendSummary {
  candidates: number;
  sent: number;
  skipped: number;
  revoked: number;
  failed: number;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function sendDailyReminders(
  pool: Pick<Pool, 'query'>,
  send: (
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
  ) => Promise<{ statusCode: number }>,
  random: () => number = Math.random,
): Promise<SendSummary> {
  const today = todayUtc();
  const result = await pool.query<SubscriptionRow>(
    `SELECT user_id, endpoint, p256dh, auth, to_char(last_sent_date, 'YYYY-MM-DD') AS last_sent_date
       FROM push_subscriptions WHERE enabled = true`,
  );

  const summary: SendSummary = {
    candidates: result.rows.length,
    sent: 0,
    skipped: 0,
    revoked: 0,
    failed: 0,
  };

  for (const row of result.rows) {
    const decision = decideNotification(
      { permissionGranted: true, enabledCategories: ['daily_review'], maxPerDay: 1 },
      {
        category: 'daily_review',
        localHour: new Date().getUTCHours(),
        sentToday: row.last_sent_date === today ? 1 : 0,
        consecutiveUnopened: 0,
      },
    );
    if (!decision.shouldSend) {
      summary.skipped += 1;
      continue;
    }

    const payload = JSON.stringify({
      title: 'LearnBox',
      body: pickRandomSentence(random),
      url: '/',
    });

    try {
      const response = await send(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        payload,
      );
      if (response.statusCode === 404 || response.statusCode === 410) {
        await pool.query(`UPDATE push_subscriptions SET enabled = false WHERE user_id = $1`, [
          row.user_id,
        ]);
        summary.revoked += 1;
        continue;
      }
      await pool.query(`UPDATE push_subscriptions SET last_sent_date = $2 WHERE user_id = $1`, [
        row.user_id,
        today,
      ]);
      summary.sent += 1;
    } catch {
      summary.failed += 1;
    }
  }

  return summary;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.LEARNBOX_APP_DATABASE_URL ?? process.env.DATABASE_URL;
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT ?? 'mailto:ops@learnboxapp.com';
  if (!databaseUrl) throw new Error('LEARNBOX_APP_DATABASE_URL (or DATABASE_URL) not set');
  if (!vapidPublicKey || !vapidPrivateKey) {
    throw new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set');
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const summary = await sendDailyReminders(pool, (subscription, payload) =>
      webpush.sendNotification(subscription, payload),
    );
    console.log('[send-daily-reminders]', JSON.stringify(summary));
  } finally {
    await pool.end();
  }
}

// Only runs the real send when executed directly (`node dist/send-daily-reminders.js`); importing
// this module for tests must not trigger network calls.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('[send-daily-reminders] failed:', error);
    process.exitCode = 1;
  });
}
