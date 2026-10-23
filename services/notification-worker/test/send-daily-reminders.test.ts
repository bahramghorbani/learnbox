import { describe, expect, it, vi } from 'vitest';

import { sendDailyReminders } from '../src/send-daily-reminders.js';

function makePool(rows: Array<Record<string, unknown>>) {
  const updates: Array<{ sql: string; params: unknown[] }> = [];
  return {
    pool: {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('SELECT user_id')) return { rows };
        updates.push({ sql, params });
        return { rows: [] };
      }),
    },
    updates,
  };
}

describe('sendDailyReminders', () => {
  it('sends once to an enabled subscription that has not been sent to today', async () => {
    const { pool, updates } = makePool([
      {
        user_id: 'u1',
        endpoint: 'https://push.example/1',
        p256dh: 'p',
        auth: 'a',
        last_sent_date: null,
      },
    ]);
    const send = vi.fn(async () => ({ statusCode: 201 }));

    const summary = await sendDailyReminders(pool, send, () => 0);

    expect(summary).toEqual({ candidates: 1, sent: 1, skipped: 0, revoked: 0, failed: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    const [subscription, payload] = send.mock.calls[0];
    expect(subscription).toEqual({
      endpoint: 'https://push.example/1',
      keys: { p256dh: 'p', auth: 'a' },
    });
    expect(JSON.parse(payload as string).body).toBeTruthy();
    expect(updates.some((u) => u.sql.includes('SET last_sent_date'))).toBe(true);
  });

  it('skips a subscription already sent to today (at-most-once-per-day via policy)', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { pool } = makePool([
      {
        user_id: 'u1',
        endpoint: 'https://push.example/1',
        p256dh: 'p',
        auth: 'a',
        last_sent_date: today,
      },
    ]);
    const send = vi.fn(async () => ({ statusCode: 201 }));

    const summary = await sendDailyReminders(pool, send);

    expect(summary).toEqual({ candidates: 1, sent: 0, skipped: 1, revoked: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it('disables the subscription on a 410 (browser revoked it) instead of retrying forever', async () => {
    const { pool, updates } = makePool([
      {
        user_id: 'u1',
        endpoint: 'https://push.example/1',
        p256dh: 'p',
        auth: 'a',
        last_sent_date: null,
      },
    ]);
    const send = vi.fn(async () => ({ statusCode: 410 }));

    const summary = await sendDailyReminders(pool, send);

    expect(summary).toEqual({ candidates: 1, sent: 0, skipped: 0, revoked: 1, failed: 0 });
    expect(updates.some((u) => u.sql.includes('SET enabled = false'))).toBe(true);
  });

  it('counts (and does not throw on) a send that rejects', async () => {
    const { pool } = makePool([
      {
        user_id: 'u1',
        endpoint: 'https://push.example/1',
        p256dh: 'p',
        auth: 'a',
        last_sent_date: null,
      },
    ]);
    const send = vi.fn(async () => {
      throw new Error('network down');
    });

    const summary = await sendDailyReminders(pool, send);

    expect(summary).toEqual({ candidates: 1, sent: 0, skipped: 0, revoked: 0, failed: 1 });
  });
});
