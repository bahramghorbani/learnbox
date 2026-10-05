import { describe, expect, it } from 'vitest';

import { PostgresContentPacksWriteStore } from '../lib/server/postgres-content-packs-write-store';

/**
 * Review / publication integrity for Pack & Card management (Phase 1 / M1.2).
 *
 * The invariant under test: editing content never rewrites a version that has left `draft`, and
 * this module never writes `published`. A recording fake pool stands in for PostgreSQL so the
 * emitted SQL and its parameters can be asserted directly.
 */

type Recorded = { sql: string; parameters: readonly unknown[] };

const actorUserId = '22222222-2222-4222-8222-222222222222';
const idempotencyKey = '11111111-1111-4111-8111-111111111111';
const cardId = '33333333-3333-4333-8333-333333333333';

const content = {
  lemma: 'Tisch',
  article: 'der',
  partOfSpeech: 'noun',
  essentialInflection: 'die Tische',
  pronunciationIpa: 'tɪʃ',
  persianMeanings: ['میز'],
  examples: [{ german: 'Der Tisch ist neu.', persian: 'میز نو است.' }],
  simpleGermanDefinition: 'Ein Möbelstück mit einer Platte.',
  grammarNote: 'اسم مذکر؛ جمع با -e.',
  topicTags: ['home'],
  difficulty: 1,
  cefr: 'A1',
  visualConcept: 'A table is the dominant object.',
  imagePrompt: 'Soft 3D table, no text.',
  sourceReference: 'Goethe A1 scope reference.',
};

/**
 * Minimal recording pool. `responses` maps a SQL fragment to the rows that query should return;
 * everything else returns no rows.
 */
function fakePool(responses: Array<[string, Record<string, unknown>[]]>) {
  const recorded: Recorded[] = [];
  const client = {
    async query(sql: string, parameters: readonly unknown[] = []) {
      recorded.push({ sql, parameters });
      const match = responses.find(([fragment]) => sql.includes(fragment));
      return { rows: match ? match[1] : [] };
    },
    release() {},
  };
  return {
    recorded,
    pool: {
      query: client.query,
      async connect() {
        return client;
      },
    },
  };
}

const editorialRole: [string, Record<string, unknown>[]] = [
  'FROM admin_role_assignments',
  [{ role: 'super_admin' }],
];
const cardRow: [string, Record<string, unknown>[]] = [
  'FROM cards WHERE id = $1 FOR UPDATE',
  [{ id: cardId, content_id: 'm12-a1-tisch' }],
];

/** A well-formed canonical media asset, shaped exactly like a stored `content_json.media[]` entry. */
const existingMedia = {
  assetId: 'start-a1-tisch-image',
  version: 1,
  kind: 'image',
  url: 'https://media.learnbox.app/packs/m12/tisch.png',
  qualityStatus: 'approved',
};

function latestVersion(status: string, version = 3) {
  return [
    'FROM card_versions',
    [{ id: 'cv-current', version, status, content_json: { media: [existingMedia] } }],
  ] as [string, Record<string, unknown>[]];
}

describe('card edit preserves review and publication integrity', () => {
  it('updates a draft version in place without creating a new version', async () => {
    const { pool, recorded } = fakePool([
      editorialRole,
      cardRow,
      latestVersion('draft'),
      ['UPDATE card_versions', [{ id: 'cv-current' }]],
    ]);
    const store = new PostgresContentPacksWriteStore(pool);

    const result = await store.editCard({ cardId, content, idempotencyKey, actorUserId });

    expect(result).toMatchObject({ status: 'applied', version: 3 });
    const sql = recorded.map((entry) => entry.sql).join('\n');
    expect(sql).toContain('UPDATE card_versions');
    expect(sql).not.toContain('INSERT INTO card_versions');
  });

  it.each(['approved', 'published', 'needs_review'])(
    'creates a NEW draft version instead of rewriting a %s version',
    async (status) => {
      const { pool, recorded } = fakePool([
        editorialRole,
        cardRow,
        latestVersion(status),
        ['INSERT INTO card_versions', [{ id: 'cv-new' }]],
      ]);
      const store = new PostgresContentPacksWriteStore(pool);

      const result = await store.editCard({ cardId, content, idempotencyKey, actorUserId });

      expect(result).toMatchObject({ status: 'applied', version: 4, cardVersionId: 'cv-new' });
      const sql = recorded.map((entry) => entry.sql).join('\n');
      expect(sql).toContain('INSERT INTO card_versions');
      expect(sql).not.toContain('UPDATE card_versions');
    },
  );

  it('never writes a published status or published_at from the management layer', async () => {
    const { pool, recorded } = fakePool([
      editorialRole,
      cardRow,
      latestVersion('published'),
      ['INSERT INTO card_versions', [{ id: 'cv-new' }]],
    ]);
    const store = new PostgresContentPacksWriteStore(pool);

    await store.editCard({ cardId, content, idempotencyKey, actorUserId });

    const inserts = recorded.filter((entry) => entry.sql.includes('INSERT INTO card_versions'));
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.sql).toContain("'draft'");
    expect(inserts[0]!.sql).not.toContain('published_at');
    // The canonical payload also carries the draft status, not the status being superseded.
    const payload = inserts[0]!.parameters.find(
      (parameter): parameter is { status: string } =>
        typeof parameter === 'object' && parameter !== null && 'status' in parameter,
    );
    expect(payload?.status).toBe('draft');
  });

  it('preserves existing media verbatim rather than dropping it on edit', async () => {
    const { pool, recorded } = fakePool([
      editorialRole,
      cardRow,
      latestVersion('published'),
      ['INSERT INTO card_versions', [{ id: 'cv-new' }]],
    ]);
    const store = new PostgresContentPacksWriteStore(pool);

    await store.editCard({ cardId, content, idempotencyKey, actorUserId });

    const insert = recorded.find((entry) => entry.sql.includes('INSERT INTO card_versions'))!;
    const payload = insert.parameters.find(
      (parameter): parameter is { media: unknown[] } =>
        typeof parameter === 'object' && parameter !== null && 'media' in parameter,
    );
    expect(payload?.media).toEqual([existingMedia]);
  });

  it('reports malformed stored media as a validation issue instead of crashing', async () => {
    // A legacy or hand-patched row whose media entry has no `url` makes the canonical validator
    // throw. That must surface as a fixable 422-style issue, never a 500.
    const { pool, recorded } = fakePool([
      editorialRole,
      cardRow,
      [
        'FROM card_versions',
        [
          {
            id: 'cv-current',
            version: 3,
            status: 'draft',
            content_json: { media: [{ assetId: 'broken' }] },
          },
        ],
      ],
    ]);
    const store = new PostgresContentPacksWriteStore(pool);

    const result = await store.editCard({ cardId, content, idempotencyKey, actorUserId });

    expect(result).toMatchObject({ status: 'invalid' });
    expect((result as { issues: Array<{ field: string }> }).issues[0]!.field).toBe('media');
    const sql = recorded.map((entry) => entry.sql).join('\n');
    expect(sql).toContain('ROLLBACK');
  });

  it('denies the write when the database resolves no editorial role', async () => {
    const { pool, recorded } = fakePool([['FROM admin_role_assignments', []]]);
    const store = new PostgresContentPacksWriteStore(pool);

    const result = await store.editCard({ cardId, content, idempotencyKey, actorUserId });

    expect(result).toEqual({ status: 'forbidden' });
    const sql = recorded.map((entry) => entry.sql).join('\n');
    expect(sql).toContain('ROLLBACK');
    expect(sql).not.toContain('INSERT INTO card_versions');
    expect(sql).not.toContain('UPDATE card_versions');
  });

  it('replays an already-applied idempotency key without writing again', async () => {
    const { pool, recorded } = fakePool([
      editorialRole,
      ['FROM audit_logs', [{ entity_id: cardId }]],
      ['FROM card_versions', [{ id: 'cv-current' }]],
    ]);
    const store = new PostgresContentPacksWriteStore(pool);

    const result = await store.editCard({ cardId, content, idempotencyKey, actorUserId });

    expect(result).toMatchObject({ status: 'idempotent', cardId });
    const sql = recorded.map((entry) => entry.sql).join('\n');
    expect(sql).not.toContain('INSERT INTO card_versions');
    expect(sql).not.toContain('UPDATE card_versions');
  });
});

describe('pack create/edit stay inside the canonical model', () => {
  it('always creates a pack as a draft and never sets published_at', async () => {
    const { pool, recorded } = fakePool([editorialRole]);
    const store = new PostgresContentPacksWriteStore(pool);

    const result = await store.createPack({
      packId: 'learnbox-m12',
      displayName: 'بستهٔ آزمایشی',
      targetCefr: 'A1',
      targetItemCount: 1,
      idempotencyKey,
      actorUserId,
    });

    expect(result).toEqual({ status: 'applied', packId: 'learnbox-m12' });
    const insert = recorded.find((entry) => entry.sql.includes('INSERT INTO packs'))!;
    expect(insert.sql).toContain("'draft'");
    expect(insert.sql).not.toContain('published_at');
  });

  it('rejects a pack id that is not a canonical slug', async () => {
    const { pool } = fakePool([editorialRole]);
    const store = new PostgresContentPacksWriteStore(pool);

    const result = await store.createPack({
      packId: 'Not A Slug!',
      displayName: 'x',
      idempotencyKey,
      actorUserId,
    });

    expect(result).toMatchObject({ status: 'invalid' });
  });

  it('never updates pack status or published_at on edit', async () => {
    const { pool, recorded } = fakePool([
      editorialRole,
      ['FROM packs WHERE id = $1 FOR UPDATE', [{ id: 'learnbox-m12' }]],
    ]);
    const store = new PostgresContentPacksWriteStore(pool);

    const result = await store.editPack({
      packId: 'learnbox-m12',
      displayName: 'نام تازه',
      idempotencyKey,
      actorUserId,
    });

    expect(result).toEqual({ status: 'applied', packId: 'learnbox-m12' });
    const update = recorded.find((entry) => entry.sql.includes('UPDATE packs'))!;
    expect(update.sql).not.toContain('status');
    expect(update.sql).not.toContain('published_at');
  });

  it('creates a card, its draft version and the pack membership edge in one transaction', async () => {
    const { pool, recorded } = fakePool([
      editorialRole,
      ['FROM packs WHERE id = $1 FOR UPDATE', [{ id: 'learnbox-m12', target_cefr: 'A1' }]],
      ['INSERT INTO card_versions', [{ id: 'cv-new' }]],
      ['COALESCE(max(sort_order)', [{ next: 1 }]],
    ]);
    const store = new PostgresContentPacksWriteStore(pool);

    const result = await store.createCard({
      packId: 'learnbox-m12',
      content,
      idempotencyKey,
      actorUserId,
    });

    expect(result).toMatchObject({ status: 'applied', version: 1 });
    const sql = recorded.map((entry) => entry.sql);
    expect(sql.some((entry) => entry.includes('INSERT INTO cards'))).toBe(true);
    expect(sql.some((entry) => entry.includes('INSERT INTO card_versions'))).toBe(true);
    expect(sql.some((entry) => entry.includes('INSERT INTO pack_cards'))).toBe(true);
    expect(sql.filter((entry) => entry === 'COMMIT')).toHaveLength(1);
  });

  it('refuses to create a card whose canonical content_id already exists', async () => {
    const { pool, recorded } = fakePool([
      editorialRole,
      ['FROM packs WHERE id = $1 FOR UPDATE', [{ id: 'learnbox-m12', target_cefr: 'A1' }]],
      ['FROM cards WHERE content_id = $1', [{ id: cardId }]],
    ]);
    const store = new PostgresContentPacksWriteStore(pool);

    const result = await store.createCard({
      packId: 'learnbox-m12',
      content,
      idempotencyKey,
      actorUserId,
    });

    expect(result).toEqual({ status: 'conflict', reason: 'content_id_exists' });
    expect(recorded.map((entry) => entry.sql).join('\n')).not.toContain('INSERT INTO cards');
  });
});
