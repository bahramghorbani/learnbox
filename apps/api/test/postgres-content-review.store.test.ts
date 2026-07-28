import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import { PostgresContentReviewStore } from '../src/admin/postgres-content-review.store.js';

const submission = {
  actorUserId: '71b5b438-99c7-4a2e-a09a-859f7c9f95cb',
  cardVersionId: 'd5065de0-5e84-4d2d-8a74-f273ea2a8998',
  action: 'approve' as const,
  decisionKey: 'b9188cc4-434c-43ea-a1d5-7ddba994367c',
  reason: 'ساختار و منابع بررسی شدند.',
};

describe('PostgresContentReviewStore', () => {
  it('records an authorized review, audit event and non-publication state in one transaction', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const client = {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        if (sql.includes('FROM admin_role_assignments'))
          return { rows: [{ role: 'content_reviewer' }] };
        if (sql.includes('FROM content_review_decisions WHERE')) return { rows: [] };
        if (sql.includes('FROM card_versions')) {
          return { rows: [{ id: submission.cardVersionId, status: 'needs_review' }] };
        }
        if (sql.includes('INSERT INTO content_review_decisions'))
          return { rows: [{ action: 'approve' }] };
        return { rows: [] };
      },
      release: () => undefined,
    };
    const pool = { connect: async () => client } as unknown as Pool;

    await expect(new PostgresContentReviewStore(pool).submit(submission)).resolves.toEqual({
      status: 'applied',
      nextStatus: 'approved',
    });

    expect(calls.map(({ sql }) => sql.split(/\s+/)[0])).toEqual([
      'BEGIN',
      'SELECT',
      'SELECT',
      'SELECT',
      'INSERT',
      'UPDATE',
      'INSERT',
      'COMMIT',
    ]);
    expect(calls[3].sql).toContain('FOR UPDATE');
    expect(calls[5].params).toEqual([submission.cardVersionId, 'approved']);
    expect(calls[6].params).toEqual([
      submission.actorUserId,
      'content_review.approve',
      submission.cardVersionId,
      submission.decisionKey,
    ]);
    expect(calls.some(({ sql }) => sql.includes("status = 'published'"))).toBe(false);
  });

  it('rejects a publisher-only actor before reading the target content', async () => {
    const calls: string[] = [];
    const client = {
      query: async (sql: string) => {
        calls.push(sql);
        if (sql.includes('FROM admin_role_assignments')) return { rows: [] };
        return { rows: [] };
      },
      release: () => undefined,
    };
    const pool = { connect: async () => client } as unknown as Pool;

    await expect(new PostgresContentReviewStore(pool).submit(submission)).resolves.toEqual({
      status: 'forbidden',
    });
    expect(calls).toEqual([expect.any(String), expect.any(String), 'ROLLBACK']);
    expect(calls.some((sql) => sql.includes('FROM card_versions'))).toBe(false);
  });

  it('returns the original action for an idempotent decision without a second update', async () => {
    const calls: string[] = [];
    const client = {
      query: async (sql: string) => {
        calls.push(sql);
        if (sql.includes('FROM admin_role_assignments')) return { rows: [{ role: 'super_admin' }] };
        if (sql.includes('FROM content_review_decisions WHERE'))
          return { rows: [{ action: 'reject' }] };
        return { rows: [] };
      },
      release: () => undefined,
    };
    const pool = { connect: async () => client } as unknown as Pool;

    await expect(new PostgresContentReviewStore(pool).submit(submission)).resolves.toEqual({
      status: 'idempotent',
      action: 'reject',
    });
    expect(calls).toContain('ROLLBACK');
    expect(calls.some((sql) => sql.startsWith('UPDATE card_versions'))).toBe(false);
  });

  it('does not accept a second decision after the version leaves the review queue', async () => {
    const calls: string[] = [];
    const client = {
      query: async (sql: string) => {
        calls.push(sql);
        if (sql.includes('FROM admin_role_assignments'))
          return { rows: [{ role: 'content_reviewer' }] };
        if (sql.includes('FROM content_review_decisions WHERE')) return { rows: [] };
        if (sql.includes('FROM card_versions')) {
          return { rows: [{ id: submission.cardVersionId, status: 'approved' }] };
        }
        return { rows: [] };
      },
      release: () => undefined,
    };
    const pool = { connect: async () => client } as unknown as Pool;

    await expect(new PostgresContentReviewStore(pool).submit(submission)).resolves.toEqual({
      status: 'not_reviewable',
      currentStatus: 'approved',
    });
    expect(calls).toContain('ROLLBACK');
    expect(calls.some((sql) => sql.includes('INSERT INTO content_review_decisions'))).toBe(false);
  });
});
