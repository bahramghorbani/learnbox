import { describe, expect, it } from 'vitest';

import { PostgresSplashStore } from '../lib/server/postgres-splash-store.js';

const now = new Date('2026-08-10T14:30:00.000Z');
const candidate = {
  bytes: Buffer.from('normalized-webp'),
  checksum: 'a'.repeat(64),
  width: 864,
  height: 1821,
  byteSize: 15,
  mediaType: 'image/webp' as const,
};

type QueryCall = { sql: string; parameters?: readonly unknown[] };

describe('PostgresSplashStore', () => {
  it('loads the current private revision and metadata for server-only delivery', async () => {
    const client = {
      async query() {
        return {
          rows: [
            {
              version_id: 'version-1',
              object_key: 'admin/splash/version-1.webp',
              width: 864,
              height: 1821,
              byte_size: 120_000,
              updated_at: now,
            },
          ],
        };
      },
      release() {},
    };
    const store = new PostgresSplashStore({ connect: async () => client });

    await expect(store.getCurrentSplash()).resolves.toEqual({
      versionId: 'version-1',
      objectKey: 'admin/splash/version-1.webp',
      width: 864,
      height: 1821,
      byteSize: 120_000,
      updatedAt: now,
    });
  });

  it('reserves a unique idempotency hash before any private upload', async () => {
    const calls: QueryCall[] = [];
    const client = {
      async query(sql: string, parameters?: readonly unknown[]) {
        calls.push({ sql, parameters });
        if (sql.includes('INSERT INTO splash_replacement_actions')) {
          return { rows: [{ id: 'action-1' }] };
        }
        return { rows: [] };
      },
      release() {},
    };
    const store = new PostgresSplashStore({ connect: async () => client });

    await expect(store.reserveReplacement({ idempotencyKeyHash: 'hash-1', now })).resolves.toEqual({
      status: 'reserved',
      actionId: 'action-1',
    });

    expect(calls.map(({ sql }) => sql.split(/\s+/)[0])).toEqual(['BEGIN', 'INSERT', 'COMMIT']);
    expect(calls[1].parameters).toEqual(['hash-1', now]);
  });

  it('returns the completed result for a duplicate idempotency hash', async () => {
    const calls: QueryCall[] = [];
    const client = {
      async query(sql: string, parameters?: readonly unknown[]) {
        calls.push({ sql, parameters });
        if (sql.includes('INSERT INTO splash_replacement_actions')) return { rows: [] };
        if (sql.includes('FROM splash_replacement_actions')) {
          return { rows: [{ status: 'completed', version_id: 'version-1' }] };
        }
        return { rows: [] };
      },
      release() {},
    };
    const store = new PostgresSplashStore({ connect: async () => client });

    await expect(store.reserveReplacement({ idempotencyKeyHash: 'hash-1', now })).resolves.toEqual({
      status: 'completed',
      versionId: 'version-1',
    });

    expect(calls.some(({ sql }) => sql.includes('FOR SHARE'))).toBe(true);
    expect(calls.at(-1)?.sql).toBe('COMMIT');
  });

  it('locks and promotes one immutable version with the audit event in one transaction', async () => {
    const calls: QueryCall[] = [];
    let released = false;
    const client = {
      async query(sql: string, parameters?: readonly unknown[]) {
        calls.push({ sql, parameters });
        if (sql.includes('FROM splash_replacement_actions')) {
          return { rows: [{ status: 'pending', version_id: null }] };
        }
        if (sql.includes('FROM current_splash')) {
          return {
            rows: [
              {
                version_id: 'previous-version',
                object_key: 'admin/splash/previous.webp',
              },
            ],
          };
        }
        return { rows: [] };
      },
      release() {
        released = true;
      },
    };
    const store = new PostgresSplashStore({ connect: async () => client });

    await expect(
      store.promoteReplacement({
        actionId: 'action-1',
        versionId: 'version-1',
        objectKey: 'admin/splash/version-1.webp',
        candidate,
        now,
      }),
    ).resolves.toEqual({
      status: 'promoted',
      versionId: 'version-1',
      previousObjectKey: 'admin/splash/previous.webp',
    });

    const sql = calls.map(({ sql }) => sql);
    expect(sql[0]).toBe('BEGIN');
    expect(sql.some((statement) => statement.includes('pg_advisory_xact_lock'))).toBe(true);
    expect(sql.some((statement) => statement.includes('FOR UPDATE'))).toBe(true);
    expect(sql.some((statement) => statement.includes('INSERT INTO splash_versions'))).toBe(true);
    expect(sql.some((statement) => statement.includes('INSERT INTO current_splash'))).toBe(true);
    expect(sql.some((statement) => statement.includes('INSERT INTO audit_logs'))).toBe(true);
    expect(sql.at(-1)).toBe('COMMIT');
    expect(released).toBe(true);
  });

  it('rolls back the pointer transaction when any persistence step fails', async () => {
    const calls: string[] = [];
    let released = false;
    const client = {
      async query(sql: string) {
        calls.push(sql);
        if (sql.includes('FROM splash_replacement_actions')) {
          return { rows: [{ status: 'pending', version_id: null }] };
        }
        if (sql.includes('FROM current_splash')) return { rows: [] };
        if (sql.includes('INSERT INTO audit_logs')) throw new Error('database failure');
        return { rows: [] };
      },
      release() {
        released = true;
      },
    };
    const store = new PostgresSplashStore({ connect: async () => client });

    await expect(
      store.promoteReplacement({
        actionId: 'action-1',
        versionId: 'version-1',
        objectKey: 'admin/splash/version-1.webp',
        candidate,
        now,
      }),
    ).rejects.toThrow('database failure');

    expect(calls).toContain('ROLLBACK');
    expect(calls).not.toContain('COMMIT');
    expect(released).toBe(true);
  });

  it('abandons only pending reservations and queues opaque bounded cleanup work', async () => {
    const calls: QueryCall[] = [];
    const client = {
      async query(sql: string, parameters?: readonly unknown[]) {
        calls.push({ sql, parameters });
        return { rows: [] };
      },
      release() {},
    };
    const store = new PostgresSplashStore({ connect: async () => client });

    await store.abandonReplacement('action-1');
    await store.queueCleanup({
      objectKey: 'admin/splash/orphan.webp',
      reasonCode: 'candidate_after_transaction_failure',
      now,
    });

    const abandon = calls.find(({ sql }) => sql.includes('DELETE FROM splash_replacement_actions'));
    expect(abandon?.sql).toContain("status = 'pending'");
    expect(abandon?.parameters).toEqual(['action-1']);
    const cleanup = calls.find(({ sql }) => sql.includes('INSERT INTO private_media_cleanup_jobs'));
    expect(cleanup?.parameters).toEqual([
      'admin/splash/orphan.webp',
      'candidate_after_transaction_failure',
      now,
    ]);
    expect(cleanup?.sql).toContain('ON CONFLICT (object_key)');
  });

  it('claims due cleanup work once and persists completion or bounded retry state', async () => {
    const calls: QueryCall[] = [];
    const client = {
      async query(sql: string, parameters?: readonly unknown[]) {
        calls.push({ sql, parameters });
        if (sql.includes('RETURNING cleanup.id')) {
          return {
            rows: [
              {
                id: 'job-1',
                object_key: 'admin/splash/orphan.webp',
                attempt_count: 2,
              },
            ],
          };
        }
        return { rows: [] };
      },
      release() {},
    };
    const store = new PostgresSplashStore({ connect: async () => client });

    await expect(store.claimCleanupJobs({ now, limit: 10 })).resolves.toEqual([
      {
        id: 'job-1',
        objectKey: 'admin/splash/orphan.webp',
        attemptCount: 2,
      },
    ]);
    await store.completeCleanup('job-1', now);
    await store.rescheduleCleanup({
      id: 'job-1',
      attemptCount: 2,
      nextAttemptAt: new Date('2026-08-10T14:40:00.000Z'),
      lastErrorCode: 'delete_failed',
    });
    await store.exhaustCleanup({
      id: 'job-1',
      attemptCount: 5,
      completedAt: now,
      lastErrorCode: 'delete_failed_exhausted',
    });

    const claim = calls.find(({ sql }) => sql.includes('RETURNING cleanup.id'));
    expect(claim?.sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(claim?.sql).toContain('attempt_count < 5');
    expect(claim?.parameters).toEqual([now, 10]);
    expect(calls.some(({ sql }) => sql.includes('SET completed_at'))).toBe(true);
    expect(calls.some(({ sql }) => sql.includes('SET next_attempt_at'))).toBe(true);
    expect(
      calls.some(({ sql }) => sql.includes("last_error_code = 'delete_failed_exhausted'")),
    ).toBe(true);
  });
});
