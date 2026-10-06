import { describe, expect, it } from 'vitest';

import type { Pool } from 'pg';

import { PostgresContentLifecycleStore } from '../lib/server/postgres-content-lifecycle-store.js';

const actorUserId = '71b5b438-99c7-4a2e-a09a-859f7c9f95cb';
const packId = 'learnbox-start';
const idempotencyKey = ['dcd8e2a0', '3d55', '4b2e', '9d4b', '9b3b8e6f4c7a'].join('-');
const reviewerUserId = '9f1c7a52-2b44-4a7d-8c3e-6b5d4e3f2a1b';
const versionOne = 'b89dabb1-406a-5b88-b535-4e90ba6af24c';
const versionTwo = 'd41d8cd9-8f00-5204-a980-0998ecf8427e';

type QueryCall = { sql: string; params?: readonly unknown[] };
type Row = Record<string, unknown>;

function createClient(
  respond: (sql: string, params: readonly unknown[] | undefined, calls: QueryCall[]) => Row[],
) {
  const calls: QueryCall[] = [];
  const client = {
    calls,
    async query(sql: string, params?: readonly unknown[]) {
      calls.push({ sql, params });
      return { rows: respond(sql, params, calls) };
    },
    release: () => undefined,
  };
  return client;
}

function poolFor(client: ReturnType<typeof createClient>) {
  return { connect: async () => client } as unknown as Pool;
}

function approvedContent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'start-a1-apfel',
    version: 1,
    status: 'approved',
    lemma: 'Apfel',
    article: 'der',
    partOfSpeech: 'noun',
    cefr: 'A1',
    persianMeanings: ['سیب'],
    examples: [{ german: 'Der Apfel ist rot.', persian: 'سیب سرخ است.' }],
    media: [],
    source: { provider: 'editorial', reference: 'learnbox-start' },
    ...overrides,
  };
}

/** One approved card in a pack that declares no fixed composition: the ready baseline. */
function readyWorld(options: { packStatus?: string; cardStatus?: string; content?: Row } = {}) {
  const cardStatus = options.cardStatus ?? 'approved';
  const content = options.content ?? approvedContent({ status: cardStatus });
  return (sql: string, params?: readonly unknown[]): Row[] => {
    if (sql.includes('FROM admin_role_assignments')) {
      const roles = (params?.[1] ?? []) as string[];
      return roles.includes('content_publisher')
        ? [{ role: 'content_publisher' }]
        : [{ role: 'content_reviewer' }];
    }
    if (sql.includes('FROM packs')) {
      return [
        {
          id: packId,
          status: options.packStatus ?? 'approved',
          published_at: null,
          target_item_count: 0,
        },
      ];
    }
    if (sql.includes('FROM pack_cards')) {
      return [
        {
          card_id: '0a4e5f6b-7c8d-4e9f-a0b1-c2d3e4f5a6b7',
          content_id: 'start-a1-apfel',
          lemma: 'Apfel',
          card_version_id: versionOne,
          status: cardStatus,
          approved_by: reviewerUserId,
        },
      ];
    }
    if (sql.includes('FROM card_versions')) {
      return [{ id: versionOne, status: cardStatus, content_json: content }];
    }
    if (sql.startsWith('UPDATE card_versions')) return [{ id: versionOne }];
    return [];
  };
}

function auditActions(calls: QueryCall[]): string[] {
  // `audit()` passes the action as a bound parameter, so the action is read from params, not SQL.
  return calls
    .filter((call) => call.sql.includes('INSERT INTO audit_logs'))
    .map((call) => String(call.params?.[1] ?? ''));
}

describe('PostgresContentLifecycleStore pack lifecycle reads', () => {
  it('refuses the lifecycle view to an actor with no editorial role', async () => {
    const client = createClient((sql) => (sql.includes('FROM admin_role_assignments') ? [] : []));
    const store = new PostgresContentLifecycleStore(poolFor(client));
    const result = await store.getPackLifecycle({ packId, actorUserId });
    expect(result.status).toBe('forbidden');
    expect(client.calls.some((call) => call.sql.includes('FROM packs'))).toBe(false);
  });

  it('reports a ready pack with no blockers and a publish-capable publisher', async () => {
    const client = createClient(readyWorld());
    const store = new PostgresContentLifecycleStore(poolFor(client));
    const result = await store.getPackLifecycle({ packId, actorUserId });
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.view.status).toBe('approved');
    expect(result.view.readiness.ready).toBe(true);
    expect(result.view.readiness.publishableCardCount).toBe(1);
    expect(result.view.canPublish).toBe(true);
    expect(result.view.canArchive).toBe(true);
    expect(result.view.canSubmitForReview).toBe(false);
  });

  it('names the concrete blocker for content that is not approved', async () => {
    const client = createClient(readyWorld({ cardStatus: 'needs_review' }));
    const store = new PostgresContentLifecycleStore(poolFor(client));
    const result = await store.getPackLifecycle({ packId, actorUserId });
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.view.readiness.ready).toBe(false);
    expect(result.view.readiness.cardBlockers[0]).toMatchObject({
      contentId: 'start-a1-apfel',
      code: 'not_approved',
    });
    expect(result.view.canPublish).toBe(false);
  });
});

describe('PostgresContentLifecycleStore draft to review', () => {
  it('moves drafts into the review queue, advances the pack and audits every move', async () => {
    const client = createClient((sql) => {
      if (sql.includes('FROM admin_role_assignments')) return [{ role: 'content_reviewer' }];
      if (sql.includes('FROM packs')) return [{ id: packId, status: 'draft' }];
      if (sql.includes('FROM pack_cards')) return [{ id: versionOne }, { id: versionTwo }];
      if (sql.includes('FOR UPDATE')) return [{ id: versionOne }, { id: versionTwo }];
      return [];
    });
    const store = new PostgresContentLifecycleStore(poolFor(client));
    const result = await store.submitPackForReview({ packId, actorUserId, idempotencyKey });
    expect(result).toMatchObject({
      status: 'applied',
      submittedCardCount: 2,
      packStatus: 'needs_review',
    });

    const sqls = client.calls.map((call) => call.sql);
    expect(sqls).toContain('COMMIT');
    expect(
      sqls.some((sql) => sql.includes("UPDATE card_versions SET status = 'needs_review'")),
    ).toBe(true);
    expect(sqls.some((sql) => sql.includes("UPDATE packs SET status = 'needs_review'"))).toBe(true);
    expect(auditActions(client.calls)).toEqual([
      'content_lifecycle.submit_for_review',
      'content_lifecycle.submit_for_review',
      'content_lifecycle.submit_pack_for_review',
    ]);
    // Nothing is ever approved or published by submission.
    expect(sqls.some((sql) => sql.includes("'approved'") || sql.includes("'published'"))).toBe(
      false,
    );
  });

  it('refuses submission from a stale lifecycle view', async () => {
    const client = createClient((sql) => {
      if (sql.includes('FROM admin_role_assignments')) return [{ role: 'content_reviewer' }];
      if (sql.includes('FROM packs')) return [{ id: packId, status: 'needs_review' }];
      return [];
    });
    const store = new PostgresContentLifecycleStore(poolFor(client));
    const result = await store.submitPackForReview({
      packId,
      actorUserId,
      idempotencyKey,
      expectedStatus: 'draft',
    });
    expect(result).toMatchObject({ status: 'stale', currentStatus: 'needs_review' });
    expect(client.calls.map((call) => call.sql)).toContain('ROLLBACK');
  });

  it('never reopens a published or archived pack for review', async () => {
    for (const status of ['published', 'archived']) {
      const client = createClient((sql) => {
        if (sql.includes('FROM admin_role_assignments')) return [{ role: 'content_reviewer' }];
        if (sql.includes('FROM packs')) return [{ id: packId, status }];
        return [];
      });
      const store = new PostgresContentLifecycleStore(poolFor(client));
      const result = await store.submitPackForReview({ packId, actorUserId, idempotencyKey });
      expect(result).toMatchObject({ status: 'stale', currentStatus: status });
    }
  });

  it('reports an empty submission instead of inventing a transition', async () => {
    const client = createClient((sql) => {
      if (sql.includes('FROM admin_role_assignments')) return [{ role: 'content_reviewer' }];
      if (sql.includes('FROM packs')) return [{ id: packId, status: 'draft' }];
      return [];
    });
    const store = new PostgresContentLifecycleStore(poolFor(client));
    const result = await store.submitPackForReview({ packId, actorUserId, idempotencyKey });
    expect(result).toMatchObject({ status: 'nothing_to_submit' });
    expect(client.calls.some((call) => call.sql.startsWith('UPDATE'))).toBe(false);
  });

  it('refuses an actor without an editorial role', async () => {
    const client = createClient((sql) => (sql.includes('FROM admin_role_assignments') ? [] : []));
    const store = new PostgresContentLifecycleStore(poolFor(client));
    expect(await store.submitPackForReview({ packId, actorUserId, idempotencyKey })).toEqual({
      status: 'forbidden',
    });
    expect(client.calls.map((call) => call.sql)).toContain('ROLLBACK');
  });
});

describe('PostgresContentLifecycleStore publish', () => {
  it('requires the publisher role, not merely the reviewer role', async () => {
    const client = createClient((sql, params) => {
      if (sql.includes('FROM admin_role_assignments')) {
        const roles = (params?.[1] ?? []) as string[];
        return roles.includes('content_publisher') ? [] : [{ role: 'content_reviewer' }];
      }
      return [];
    });
    const store = new PostgresContentLifecycleStore(poolFor(client));
    expect(await store.publishPack({ packId, actorUserId, idempotencyKey })).toEqual({
      status: 'forbidden',
    });
    expect(client.calls.some((call) => call.sql.startsWith('UPDATE'))).toBe(false);
  });

  it('publishes an approved pack, records the reviewer and audits the release', async () => {
    const client = createClient(readyWorld());
    const store = new PostgresContentLifecycleStore(poolFor(client));
    const result = await store.publishPack({ packId, actorUserId, idempotencyKey });
    expect(result).toMatchObject({ status: 'applied', publishedCardCount: 1 });

    const cardUpdate = client.calls.find((call) => call.sql.startsWith('UPDATE card_versions'));
    expect(cardUpdate?.sql).toContain("status = 'published'");
    expect(cardUpdate?.sql).toContain('published_at = now()');
    const persisted = cardUpdate?.params?.[1] as {
      status: string;
      source: { provider: string; reviewedBy?: string };
    };
    expect(persisted.status).toBe('published');
    // Provenance is preserved and the approving human is recorded alongside it.
    expect(persisted.source.provider).toBe('editorial');
    expect(persisted.source.reviewedBy).toBe(reviewerUserId);

    const packUpdate = client.calls.find((call) => call.sql.includes('UPDATE packs'));
    expect(packUpdate?.sql).toContain("status = 'published'");
    expect(auditActions(client.calls)).toEqual([
      'content_lifecycle.publish',
      'content_lifecycle.publish_pack',
    ]);
    expect(client.calls.map((call) => call.sql)).toContain('COMMIT');
  });

  it('refuses to publish content that is not editorially approved', async () => {
    const client = createClient(readyWorld({ cardStatus: 'needs_review' }));
    const store = new PostgresContentLifecycleStore(poolFor(client));
    const result = await store.publishPack({ packId, actorUserId, idempotencyKey });
    if (result.status !== 'not_ready') throw new Error('expected not_ready');
    expect(result.readiness.cardBlockers[0]?.code).toBe('not_approved');
    expect(client.calls.some((call) => call.sql.startsWith('UPDATE'))).toBe(false);
    expect(client.calls.map((call) => call.sql)).toContain('ROLLBACK');
  });

  it('refuses to publish AI-sourced content with no recorded human reviewer', async () => {
    const client = createClient((sql, params) => {
      const respond = readyWorld({
        content: approvedContent({ source: { provider: 'ai_suggestion', reference: 'avalai' } }),
      });
      if (sql.includes('FROM pack_cards')) {
        return [
          {
            card_id: '0a4e5f6b-7c8d-4e9f-a0b1-c2d3e4f5a6b7',
            content_id: 'start-a1-apfel',
            lemma: 'Apfel',
            card_version_id: versionOne,
            status: 'approved',
            approved_by: null,
          },
        ];
      }
      return respond(sql, params);
    });
    const store = new PostgresContentLifecycleStore(poolFor(client));
    const result = await store.publishPack({ packId, actorUserId, idempotencyKey });
    if (result.status !== 'not_ready') throw new Error('expected not_ready');
    expect(result.readiness.cardBlockers[0]?.code).toBe('unreviewed_ai_content');
    expect(client.calls.some((call) => call.sql.startsWith('UPDATE'))).toBe(false);
  });

  it('treats the locked row as authoritative when a card moves mid-transaction', async () => {
    // The unlocked read sees `approved`; the locked read sees a concurrent return to revision.
    const client = createClient((sql, params) => {
      const respond = readyWorld();
      if (sql.includes('FROM card_versions') && sql.includes('FOR UPDATE')) {
        return [{ id: versionOne, status: 'needs_review', content_json: approvedContent() }];
      }
      return respond(sql, params);
    });
    const store = new PostgresContentLifecycleStore(poolFor(client));
    const result = await store.publishPack({ packId, actorUserId, idempotencyKey });
    if (result.status !== 'not_ready') throw new Error('expected not_ready');
    expect(result.readiness.cardBlockers[0]?.code).toBe('not_approved');
    expect(client.calls.some((call) => call.sql.startsWith('UPDATE'))).toBe(false);
  });

  it('is idempotent on an already published pack and never rewrites it', async () => {
    const client = createClient(readyWorld({ packStatus: 'published' }));
    const store = new PostgresContentLifecycleStore(poolFor(client));
    expect(await store.publishPack({ packId, actorUserId, idempotencyKey })).toEqual({
      status: 'idempotent',
    });
    expect(client.calls.some((call) => call.sql.startsWith('UPDATE'))).toBe(false);
  });

  it('refuses a publish authorised against a stale lifecycle view', async () => {
    const client = createClient(readyWorld({ packStatus: 'needs_review' }));
    const store = new PostgresContentLifecycleStore(poolFor(client));
    const result = await store.publishPack({
      packId,
      actorUserId,
      idempotencyKey,
      expectedStatus: 'approved',
    });
    expect(result).toMatchObject({ status: 'stale', currentStatus: 'needs_review' });
    expect(client.calls.some((call) => call.sql.startsWith('UPDATE'))).toBe(false);
  });

  it('rejects a malformed idempotency key before touching the database', async () => {
    const client = createClient(() => []);
    const store = new PostgresContentLifecycleStore(poolFor(client));
    await expect(
      store.publishPack({ packId, actorUserId, idempotencyKey: 'not-a-uuid' }),
    ).rejects.toThrow(/Idempotency key/);
    expect(client.calls).toHaveLength(0);
  });
});

describe('PostgresContentLifecycleStore archive', () => {
  it('deactivates published cards by status only and audits the deactivation', async () => {
    const client = createClient((sql, params) => {
      const respond = readyWorld({ packStatus: 'published' });
      if (sql.startsWith('UPDATE card_versions')) return [{ id: versionOne }];
      return respond(sql, params);
    });
    const store = new PostgresContentLifecycleStore(poolFor(client));
    const result = await store.archivePack({ packId, actorUserId, idempotencyKey });
    expect(result).toMatchObject({ status: 'applied', deactivatedCardCount: 1 });

    const sqls = client.calls.map((call) => call.sql);
    expect(sqls.some((sql) => sql.includes("SET status = 'deprecated'"))).toBe(true);
    expect(sqls.some((sql) => sql.includes("UPDATE packs SET status = 'archived'"))).toBe(true);
    expect(auditActions(client.calls)).toEqual([
      'content_lifecycle.deprecate',
      'content_lifecycle.archive_pack',
    ]);
    // Historical integrity: deactivation never deletes rows of any kind.
    expect(sqls.some((sql) => /\bDELETE\b|\bTRUNCATE\b|\bDROP\b/i.test(sql))).toBe(false);
    expect(sqls).toContain('COMMIT');
  });

  it('requires the publisher role to deactivate', async () => {
    const client = createClient((sql, params) => {
      if (sql.includes('FROM admin_role_assignments')) {
        const roles = (params?.[1] ?? []) as string[];
        return roles.includes('content_publisher') ? [] : [{ role: 'content_reviewer' }];
      }
      return [];
    });
    const store = new PostgresContentLifecycleStore(poolFor(client));
    expect(await store.archivePack({ packId, actorUserId, idempotencyKey })).toEqual({
      status: 'forbidden',
    });
  });

  it('is idempotent on an already archived pack', async () => {
    const client = createClient(readyWorld({ packStatus: 'archived' }));
    const store = new PostgresContentLifecycleStore(poolFor(client));
    expect(await store.archivePack({ packId, actorUserId, idempotencyKey })).toEqual({
      status: 'idempotent',
    });
    expect(client.calls.some((call) => call.sql.startsWith('UPDATE'))).toBe(false);
  });
});
