import { describe, expect, it } from 'vitest';

import type { Pool } from 'pg';

import { CARD_MEDIA_KINDS, expectedCardMedia } from '@learnbox/content-models';

import { readCanonicalImageStandard } from '../lib/server/canonical-image-standard.js';
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
    // Shared card standard: IPA, plural, definition, grammar note and an English image subject.
    pronunciation: { ipa: 'ˈapfəl', locale: 'de-DE' },
    essentialInflection: 'die Äpfel',
    simpleGermanDefinition: 'Eine runde Frucht.',
    grammarNote: 'اسم مذکر؛ جمع با تغییر واکه.',
    imagePrompt: 'One red apple, large and centered.',
    ...overrides,
  };
}

const CARD_ID = '0a4e5f6b-7c8d-4e9f-a0b1-c2d3e4f5a6b7';

/** Accepted Admin media for every kind, attributed to exactly what `content` needs. */
function acceptedMediaRows(content: Row): Row[] {
  const expected = expectedCardMedia(content as Record<string, unknown>);
  const voice: Record<string, string> = { der: 'sage', die: 'nova', das: 'fable', default: 'nova' };
  return CARD_MEDIA_KINDS.map((kind, index) => {
    const entry = expected[kind] as Record<string, string>;
    const id = `5b1e2c3d-4e5f-4a6b-8c7d-${String(index).padStart(12, '0')}`;
    return {
      id,
      card_id: CARD_ID,
      kind,
      object_key: `admin/card-media/start-a1-apfel/${kind}/${id}.${kind === 'image' ? 'png' : 'mp3'}`,
      checksum: 'a'.repeat(64),
      media_type: kind === 'image' ? 'image/png' : 'audio/mpeg',
      spoken_target: entry.spokenTarget ?? null,
      voice: kind === 'image' ? null : voice[entry.voiceRole!],
      voice_role: entry.voiceRole ?? null,
      image_subject: entry.subject ?? null,
      image_standard_version: kind === 'image' ? readCanonicalImageStandard().version : null,
    };
  });
}

/** One approved card in a pack that declares no fixed composition: the ready baseline. */
function readyWorld(
  options: { packStatus?: string; cardStatus?: string; content?: Row; media?: Row[] } = {},
) {
  const cardStatus = options.cardStatus ?? 'approved';
  const content = options.content ?? approvedContent({ status: cardStatus });
  const media = options.media ?? acceptedMediaRows(content);
  return (sql: string, params?: readonly unknown[]): Row[] => {
    if (sql.includes('FROM card_media_assets')) return media;
    if (sql.includes('FROM card_media_candidates')) return [];
    if (sql.includes("status IN ('published', 'deprecated')")) return [];
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
      return [
        {
          id: versionOne,
          status: cardStatus,
          content_json: content,
          content_id: 'start-a1-apfel',
          lemma: 'Apfel',
        },
      ];
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
      if (sql.includes('FOR UPDATE')) {
        return [versionOne, versionTwo].map((id) => ({
          id,
          content_json: approvedContent({ status: 'draft' }),
          content_id: 'start-a1-apfel',
          lemma: 'Apfel',
        }));
      }
      return [];
    });
    const store = new PostgresContentLifecycleStore(poolFor(client));
    const result = await store.submitPackForReview({ packId, actorUserId, idempotencyKey });
    expect(result).toMatchObject({
      status: 'applied',
      submittedCardCount: 2,
      packStatus: 'needs_review',
      incompleteCards: [],
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

  it('allows draft revisions in a published pack into the human review queue but keeps archives closed', async () => {
    for (const [status, expected] of [
      ['published', 'nothing_to_submit'],
      ['archived', 'stale'],
    ] as const) {
      const client = createClient((sql) => {
        if (sql.includes('FROM admin_role_assignments')) return [{ role: 'content_reviewer' }];
        if (sql.includes('FROM packs')) return [{ id: packId, status }];
        return [];
      });
      const store = new PostgresContentLifecycleStore(poolFor(client));
      const result = await store.submitPackForReview({ packId, actorUserId, idempotencyKey });
      expect(result.status).toBe(expected);
      if (expected === 'stale') expect(result).toMatchObject({ currentStatus: status });
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

  it('publishes an approved revision in an already published pack', async () => {
    const client = createClient(readyWorld({ packStatus: 'published' }));
    const store = new PostgresContentLifecycleStore(poolFor(client));
    expect(await store.publishPack({ packId, actorUserId, idempotencyKey })).toMatchObject({
      status: 'applied',
      publishedCardCount: 1,
    });
    const sqls = client.calls.map((call) => call.sql);
    expect(sqls.some((sql) => sql.includes("SET status = 'deprecated'"))).toBe(true);
    expect(sqls.some((sql) => sql.includes("SET status = 'published'"))).toBe(true);
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
  it('archives without mutating buyer-visible card versions', async () => {
    const client = createClient(readyWorld({ packStatus: 'published' }));
    const store = new PostgresContentLifecycleStore(poolFor(client));
    const result = await store.archivePack({ packId, actorUserId, idempotencyKey });
    expect(result).toMatchObject({ status: 'applied', deactivatedCardCount: 0 });

    const sqls = client.calls.map((call) => call.sql);
    expect(sqls.some((sql) => sql.includes("SET status = 'deprecated'"))).toBe(false);
    expect(sqls.some((sql) => sql.includes("UPDATE packs SET status = 'archived'"))).toBe(true);
    expect(auditActions(client.calls)).toEqual(['content_lifecycle.archive_pack']);
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

describe('PostgresContentLifecycleStore card standard and media gates (owner rules 2026-10-16)', () => {
  function draftWorld(rows: Row[]) {
    return (sql: string): Row[] => {
      if (sql.includes('FROM admin_role_assignments')) return [{ role: 'content_reviewer' }];
      if (sql.includes('FROM packs')) return [{ id: packId, status: 'draft' }];
      if (sql.includes('FROM pack_cards')) return rows.map((row) => ({ id: row.id }));
      if (sql.includes('FOR UPDATE')) return rows;
      return [];
    };
  }

  it('keeps a card without IPA as a draft, reports why, and submits the complete one', async () => {
    const withoutIpa = approvedContent({ status: 'draft', pronunciation: undefined });
    const client = createClient(
      draftWorld([
        {
          id: versionOne,
          content_json: approvedContent({ status: 'draft' }),
          content_id: 'start-a1-apfel',
          lemma: 'Apfel',
        },
        { id: versionTwo, content_json: withoutIpa, content_id: 'start-a1-birne', lemma: 'Birne' },
      ]),
    );
    const result = await new PostgresContentLifecycleStore(poolFor(client)).submitPackForReview({
      packId,
      actorUserId,
      idempotencyKey,
    });
    if (result.status !== 'applied') throw new Error(`expected applied, got ${result.status}`);
    expect(result.submittedCardCount).toBe(1);
    expect(result.incompleteCards).toHaveLength(1);
    expect(result.incompleteCards[0]!.contentId).toBe('start-a1-birne');
    expect(result.incompleteCards[0]!.issues.map((issue) => issue.field)).toContain(
      'pronunciation.ipa',
    );
    const moved = client.calls.find((call) => call.sql.includes("SET status = 'needs_review'"));
    expect(JSON.stringify(moved?.params)).not.toContain(versionTwo);
  });

  it('submits nothing and says so when every card is incomplete', async () => {
    const client = createClient(
      draftWorld([
        {
          id: versionOne,
          content_json: approvedContent({ status: 'draft', pronunciation: undefined }),
          content_id: 'start-a1-apfel',
          lemma: 'Apfel',
        },
      ]),
    );
    const result = await new PostgresContentLifecycleStore(poolFor(client)).submitPackForReview({
      packId,
      actorUserId,
      idempotencyKey,
    });
    expect(result.status).toBe('incomplete');
    expect(client.calls.map((call) => call.sql)).toContain('ROLLBACK');
  });

  it('blocks publishing when accepted media no longer matches the example text', async () => {
    const content = approvedContent();
    const media = acceptedMediaRows({
      ...content,
      examples: [{ german: 'Der Apfel ist grün.', persian: 'سیب سبز است.' }],
    });
    const client = createClient(readyWorld({ content, media }));
    const result = await new PostgresContentLifecycleStore(poolFor(client)).getPackLifecycle({
      packId,
      actorUserId,
    });
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.view.readiness.ready).toBe(false);
    const blocker = result.view.readiness.cardBlockers[0]!;
    expect(blocker.code).toBe('media_not_ready');
    expect(blocker.issues.map((issue) => issue.field)).toEqual(['media.sentence_audio']);
  });

  it('blocks publishing a card with no media at all', async () => {
    const client = createClient(readyWorld({ media: [] }));
    const result = await new PostgresContentLifecycleStore(poolFor(client)).getPackLifecycle({
      packId,
      actorUserId,
    });
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.view.readiness.cardBlockers[0]!.code).toBe('media_not_ready');
    expect(result.view.canPublish).toBe(false);
  });

  it('pins accepted media by object key and checksum into the published version', async () => {
    const client = createClient(readyWorld());
    const result = await new PostgresContentLifecycleStore(poolFor(client)).publishPack({
      packId,
      actorUserId,
      idempotencyKey,
    });
    expect(result.status).toBe('applied');
    const update = client.calls.find((call) => call.sql.startsWith('UPDATE card_versions'));
    const published = update?.params?.[1] as { media: Array<Record<string, unknown>> };
    expect(published.media.map((entry) => entry.kind)).toEqual([
      'image',
      'word_audio',
      'sentence_audio',
    ]);
    for (const entry of published.media) {
      expect(entry.objectKey).toMatch(/^admin\/card-media\/start-a1-apfel\//);
      expect(entry.checksum).toBe('a'.repeat(64));
      expect(entry.qualityStatus).toBe('approved');
    }
  });
});
