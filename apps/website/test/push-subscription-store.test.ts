import { describe, expect, it, vi } from 'vitest';

import {
  disableReminderSubscription,
  parsePushSubscription,
  readReminderStatus,
  saveReminderSubscription,
} from '../lib/push-subscription-store';

function fakePool(rows: Array<Record<string, unknown>> = []) {
  const query = vi.fn(async () => ({ rows }));
  return { query } as unknown as import('pg').Pool;
}

describe('parsePushSubscription', () => {
  it('accepts a well-formed browser PushSubscription.toJSON() payload', () => {
    const result = parsePushSubscription({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'p-key', auth: 'a-key' },
    });
    expect(result).toEqual({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      p256dh: 'p-key',
      auth: 'a-key',
    });
  });

  it.each([
    [null],
    [{}],
    [{ endpoint: 'not-https' }],
    [{ endpoint: 'https://x', keys: {} }],
    [{ endpoint: 'https://x', keys: { p256dh: '', auth: 'a' } }],
    ['a string, not an object'],
  ])('rejects malformed input %#', (input) => {
    expect(parsePushSubscription(input)).toBeNull();
  });
});

describe('saveReminderSubscription / disableReminderSubscription / readReminderStatus', () => {
  it('upserts with enabled=true on save', async () => {
    const pool = fakePool();
    await saveReminderSubscription(pool, 'user-1', {
      endpoint: 'https://push.example/1',
      p256dh: 'p',
      auth: 'a',
    });
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain('INSERT INTO push_subscriptions');
    expect(sql).toContain('enabled = true');
    expect(params).toEqual(['user-1', 'https://push.example/1', 'p', 'a']);
  });

  it('turns the row off without deleting it', async () => {
    const pool = fakePool();
    await disableReminderSubscription(pool, 'user-1');
    const [sql, params] = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(sql).toContain('SET enabled = false');
    expect(sql).not.toContain('DELETE');
    expect(params).toEqual(['user-1']);
  });

  it('reports disabled (false) for a learner with no subscription row at all', async () => {
    const pool = fakePool([]);
    const status = await readReminderStatus(pool, 'user-with-no-row');
    expect(status).toEqual({ enabled: false });
  });

  it('reports the stored enabled value for an existing row', async () => {
    const pool = fakePool([{ enabled: true }]);
    const status = await readReminderStatus(pool, 'user-1');
    expect(status).toEqual({ enabled: true });
  });
});
