import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { Pool } from 'pg';

import { PostgresContentReviewStore } from '../lib/server/postgres-content-review-store.js';

const repoRoot = join(process.cwd(), '..', '..');
const migrationPath = join(
  repoRoot,
  'database/migrations/0017_start_catalog_review_candidates.sql',
);
const verticalDraftsPath = join(
  repoRoot,
  'content/packs/learnbox-start/vocabulary/start-a1-vertical-slice-drafts.json',
);
const pendingDraftsPath = join(
  repoRoot,
  'content/packs/learnbox-start/vocabulary/start-a1-catalog-35-pending-drafts.json',
);

const requiredDimensions = [
  'german_linguistic',
  'persian_translation',
  'provenance',
  'visual',
  'audio',
  'app_flow',
];

async function readJson(path: string) {
  return JSON.parse(await readFile(path, 'utf8'));
}

describe('0017 Start Pack review-candidate migration contract', () => {
  it('declares exactly the 35 committed draft ids with deterministic uuid5 identities', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    const drafts = [
      ...(await readJson(verticalDraftsPath)).items,
      ...(await readJson(pendingDraftsPath)).items,
    ];
    expect(drafts).toHaveLength(35);

    const candidateLines = sql.match(
      /^-- candidate [a-z0-9-]+ card=[0-9a-f-]+ version=[0-9a-f-]+$/gm,
    );
    expect(candidateLines).toHaveLength(35);
    const declaredIds = candidateLines!.map((line) => line.split(' ')[2]);
    expect(new Set(declaredIds).size).toBe(35);
    expect([...declaredIds].sort()).toEqual(drafts.map((item) => item.id).sort());

    // Every declared identity is a fixed uuid5 literal; no random identity generator is allowed.
    const uuid5Literals = sql.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g,
    );
    expect(uuid5Literals).toHaveLength(980);
    expect(sql).not.toContain('gen_random_uuid');
  });

  it('inserts exactly six pending checks per candidate without reviewer attribution', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    const checkLines = sql.match(
      /^-- check [a-z0-9-]+ (german_linguistic|persian_translation|provenance|visual|audio|app_flow) id=[0-9a-f-]+ idem=[0-9a-f-]+$/gm,
    );
    expect(checkLines).toHaveLength(210);
    const byId = new Map<string, number>();
    for (const line of checkLines!) {
      const id = line.split(' ')[2];
      byId.set(id, (byId.get(id) ?? 0) + 1);
      expect(requiredDimensions).toContain(line.split(' ')[3]);
    }
    expect(byId.size).toBe(35);
    for (const count of byId.values()) expect(count).toBe(6);

    // Repository evidence never becomes a database-user attestation and nothing is released.
    expect(sql).not.toContain('INSERT INTO content_review_decisions');
    expect(sql).not.toContain("status = 'approved'");
    expect(sql).not.toContain("status = 'published'");
    expect(sql).not.toContain("outcome = 'passed'");
    expect(sql).not.toContain("outcome = 'failed'");
    expect(sql).toMatch(/'needs_review'/);
    expect(sql).toContain('reviewer_user_id IS NOT NULL');
  });

  it('reruns are idempotent only for identical rows and fail closed on divergent data', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    expect(sql).toMatch(/RAISE EXCEPTION '0017 fail-closed/);
    expect(sql).toContain('IS DISTINCT FROM');
    expect(sql).toMatch(/WHERE NOT EXISTS \(SELECT 1 FROM cards/);
    expect(sql).toMatch(/WHERE NOT EXISTS \(SELECT 1 FROM card_versions/);
  });

  it('embeds the committed drafts faithfully without losing source or provenance fields', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    const drafts = [
      ...(await readJson(verticalDraftsPath)).items,
      ...(await readJson(pendingDraftsPath)).items,
    ];
    for (const item of drafts) {
      expect(sql).toContain(`"id":"${item.id}"`);
      expect(sql).toContain(`"lemma":"${item.lemma}"`);
      expect(sql).toContain(`"sourceType":"${item.provenance.sourceType}"`);
      expect(sql).toContain(`"sourceReference":"${item.provenance.sourceReference}"`);
      expect(sql).toContain(`"provider":"${item.source.provider}"`);
    }
    expect(sql).toContain('"status":"needs_review"');
  });

  it('keeps the additive idempotency-key column deterministic and non-destructive', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS idempotency_key UUID');
    expect(sql).toContain('content_review_checks_idempotency_key_unique');
  });
});

const actorUserId = '71b5b438-99c7-4a2e-a09a-859f7c9f95cb';
const cardVersionId = 'b89dabb1-406a-5b88-b535-4e90ba6af24c';
const idempotencyKey = ['dcd8e2a0', '3d55', '4b2e', '9d4b', '9b3b8e6f4c7a'].join('-');
const decisionKey = ['b9188cc4', '434c', '43ea', 'a1d5', '7ddba994367c'].join('-');

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

const versionRow = { id: cardVersionId, status: 'needs_review' };

describe('PostgresContentReviewStore queue reads', () => {
  it('returns the role-authorized review queue with strictly mapped candidate rows and checks', async () => {
    const client = createClient((sql) => {
      if (sql.includes('FROM admin_role_assignments')) return [{ role: 'content_reviewer' }];
      if (sql.includes('FROM card_versions')) {
        return [
          {
            id: cardVersionId,
            status: 'needs_review',
            content_id: 'start-a1-haus',
            lemma: 'Haus',
            content_json: {
              lemma: 'Haus',
              article: 'das',
              partOfSpeech: 'noun',
              persianMeanings: ['خانه'],
              essentialInflection: 'die Häuser',
              pronunciation: { ipa: 'haʊs' },
              examples: [{ german: 'Das Haus ist klein.', persian: 'خانه کوچک است.' }],
              media: [],
              source: {
                provider: 'ai_suggestion',
                reference:
                  'Goethe A1 scope reference; German and Persian linguistic review recorded.',
              },
            },
          },
        ];
      }
      if (sql.includes('FROM content_review_checks')) {
        return [
          {
            card_version_id: cardVersionId,
            dimension: 'german_linguistic',
            outcome: 'pending',
            notes: null,
            reviewed_at: null,
          },
          {
            card_version_id: cardVersionId,
            dimension: 'persian_translation',
            outcome: 'pending',
            notes: null,
            reviewed_at: null,
          },
          {
            card_version_id: cardVersionId,
            dimension: 'provenance',
            outcome: 'pending',
            notes: null,
            reviewed_at: null,
          },
          {
            card_version_id: cardVersionId,
            dimension: 'visual',
            outcome: 'pending',
            notes: null,
            reviewed_at: null,
          },
          {
            card_version_id: cardVersionId,
            dimension: 'audio',
            outcome: 'pending',
            notes: null,
            reviewed_at: null,
          },
          {
            card_version_id: cardVersionId,
            dimension: 'app_flow',
            outcome: 'pending',
            notes: null,
            reviewed_at: null,
          },
        ];
      }
      return [];
    });
    const pool = poolFor(client);
    const store = new PostgresContentReviewStore(pool);

    await expect(store.listReviewQueue(actorUserId)).resolves.toEqual({
      status: 'ok',
      items: [
        {
          cardVersionId,
          contentId: 'start-a1-haus',
          lemma: 'Haus',
          status: 'needs_review',
          article: 'das',
          partOfSpeech: 'noun',
          persianMeanings: ['خانه'],
          essentialInflection: 'die Häuser',
          pronunciationIpa: 'haʊs',
          examples: [{ german: 'Das Haus ist klein.', persian: 'خانه کوچک است.' }],
          mediaCount: 0,
          sourceProvider: 'ai_suggestion',
          sourceReference:
            'Goethe A1 scope reference; German and Persian linguistic review recorded.',
          checks: requiredDimensions.map((dimension) => ({
            dimension,
            outcome: 'pending',
            notes: null,
            reviewedAt: null,
          })),
        },
      ],
    });
    // Role authorization always precedes any review-data read.
    const roleCallIndex = client.calls.findIndex((call) =>
      call.sql.includes('FROM admin_role_assignments'),
    );
    const reviewCallIndex = client.calls.findIndex((call) =>
      call.sql.includes('FROM card_versions'),
    );
    expect(roleCallIndex).toBeGreaterThanOrEqual(0);
    expect(reviewCallIndex).toBeGreaterThan(roleCallIndex);
  });

  it('never reads review data for an actor without a review role', async () => {
    const client = createClient((sql) => {
      if (sql.includes('FROM admin_role_assignments')) return [];
      return [{ id: cardVersionId, status: 'needs_review' }];
    });
    const store = new PostgresContentReviewStore(poolFor(client));

    await expect(store.listReviewQueue(actorUserId)).resolves.toEqual({ status: 'forbidden' });
    expect(client.calls.some((call) => call.sql.includes('FROM card_versions'))).toBe(false);
  });
});

describe('PostgresContentReviewStore check writes', () => {
  const checkInput = {
    cardVersionId,
    dimension: 'german_linguistic' as const,
    outcome: 'passed' as const,
    notes: 'ساختار و منابع بررسی شدند.',
    idempotencyKey,
  };

  it('locks the target version and atomically records a passed/failed verdict with audit attribution', async () => {
    const client = createClient((sql) => {
      if (sql.includes('FROM admin_role_assignments')) return [{ role: 'content_reviewer' }];
      if (sql.includes('FROM card_versions')) return [versionRow];
      // Existing pending baseline check row (0017) for the dimension.
      if (sql.includes('FROM content_review_checks') && sql.includes('FOR UPDATE')) {
        return [{ id: 'check-row-1', outcome: 'pending', idempotency_key: null }];
      }
      if (sql.includes('UPDATE content_review_checks')) return [{ outcome: 'passed' }];
      if (sql.includes('INSERT INTO audit_logs')) return [];
      return [];
    });
    const store = new PostgresContentReviewStore(poolFor(client));

    await expect(store.recordCheck(actorUserId, checkInput)).resolves.toEqual({
      status: 'applied',
    });

    const statements = client.calls.map(({ sql }) => sql.split(/\s+/)[0]);
    expect(statements).toEqual([
      'BEGIN',
      'SELECT',
      'SELECT',
      'SELECT',
      'UPDATE',
      'INSERT',
      'COMMIT',
    ]);
    const versionLock = client.calls[2].sql;
    expect(versionLock).toContain('FOR UPDATE');
    const update = client.calls.find((call) => call.sql.startsWith('UPDATE content_review_checks'));
    expect(update?.params).toEqual([
      'passed',
      actorUserId,
      checkInput.notes,
      idempotencyKey,
      cardVersionId,
      'german_linguistic',
    ]);
    const audit = client.calls.find((call) => call.sql.includes('INSERT INTO audit_logs'));
    expect(audit?.params).toEqual([
      actorUserId,
      'content_review.check',
      cardVersionId,
      expect.anything(),
    ]);
    expect(audit?.params?.[3]).toMatchObject({ dimension: 'german_linguistic', outcome: 'passed' });
    // A check write must never touch card_versions status or publish anything.
    expect(client.calls.some((call) => call.sql.includes('UPDATE card_versions'))).toBe(false);
    expect(client.calls.some((call) => call.sql.includes('published'))).toBe(false);
  });

  it('inserts a fresh check row with a deterministic key when no baseline row exists', async () => {
    const client = createClient((sql) => {
      if (sql.includes('FROM admin_role_assignments')) return [{ role: 'super_admin' }];
      if (sql.includes('FROM card_versions')) return [versionRow];
      if (sql.includes('FROM content_review_checks WHERE card_version_id')) return [];
      if (sql.includes('INSERT INTO content_review_checks')) return [{ id: 'new-check-row' }];
      return [];
    });
    const store = new PostgresContentReviewStore(poolFor(client));

    await expect(store.recordCheck(actorUserId, checkInput)).resolves.toEqual({
      status: 'applied',
    });
    const insert = client.calls.find((call) =>
      call.sql.startsWith('INSERT INTO content_review_checks'),
    );
    expect(insert?.params).toEqual([
      actorUserId,
      cardVersionId,
      'german_linguistic',
      'passed',
      checkInput.notes,
      ['ee6779e4', '9fb8', '5a9e', '9e1e', 'c3762d25b050'].join('-'),
      idempotencyKey,
    ]);
  });

  it('returns idempotent for an identical replay and writes nothing a second time', async () => {
    const client = createClient((sql) => {
      if (sql.includes('FROM admin_role_assignments')) return [{ role: 'content_reviewer' }];
      if (sql.includes('FROM card_versions')) return [versionRow];
      if (sql.includes('FROM content_review_checks') && sql.includes('FOR UPDATE')) {
        return [{ id: 'check-row-1', outcome: 'passed', idempotency_key: idempotencyKey }];
      }
      return [];
    });
    const store = new PostgresContentReviewStore(poolFor(client));

    await expect(store.recordCheck(actorUserId, checkInput)).resolves.toEqual({
      status: 'idempotent',
    });
    expect(client.calls.some((call) => call.sql === 'ROLLBACK')).toBe(true);
    expect(client.calls.some((call) => call.sql.startsWith('UPDATE content_review_checks'))).toBe(
      false,
    );
    expect(client.calls.some((call) => call.sql.includes('INSERT INTO audit_logs'))).toBe(false);
  });

  it('fails closed with a conflict when a verdict already exists under a different key or outcome', async () => {
    const client = createClient((sql) => {
      if (sql.includes('FROM admin_role_assignments')) return [{ role: 'content_reviewer' }];
      if (sql.includes('FROM card_versions')) return [versionRow];
      if (sql.includes('FROM content_review_checks') && sql.includes('FOR UPDATE')) {
        return [
          {
            id: 'check-row-1',
            outcome: 'failed',
            idempotency_key: '11111111-1111-4111-8111-111111111111',
          },
        ];
      }
      return [];
    });
    const store = new PostgresContentReviewStore(poolFor(client));

    await expect(
      store.recordCheck(actorUserId, { ...checkInput, outcome: 'passed' }),
    ).resolves.toEqual({ status: 'conflict' });
    expect(client.calls.some((call) => call.sql === 'ROLLBACK')).toBe(true);
    expect(client.calls.some((call) => call.sql.startsWith('UPDATE content_review_checks'))).toBe(
      false,
    );
  });

  it('maps a cross-target idempotency-key collision to conflict instead of a server error', async () => {
    const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });
    const client = createClient((sql) => {
      if (sql.includes('FROM admin_role_assignments')) return [{ role: 'content_reviewer' }];
      if (sql.includes('FROM card_versions')) return [versionRow];
      if (sql.includes('FROM content_review_checks WHERE card_version_id')) return [];
      if (sql.includes('INSERT INTO content_review_checks')) throw uniqueViolation;
      return [];
    });

    await expect(
      new PostgresContentReviewStore(poolFor(client)).recordCheck(actorUserId, checkInput),
    ).resolves.toEqual({ status: 'conflict' });
    expect(client.calls.some((call) => call.sql === 'ROLLBACK')).toBe(true);
    expect(client.calls.some((call) => call.sql.includes('INSERT INTO audit_logs'))).toBe(false);
  });

  it('rejects a non-reviewer actor before reading the target version', async () => {
    const client = createClient((sql) => {
      if (sql.includes('FROM admin_role_assignments')) return [];
      return [versionRow];
    });
    const store = new PostgresContentReviewStore(poolFor(client));

    await expect(store.recordCheck(actorUserId, checkInput)).resolves.toEqual({
      status: 'forbidden',
    });
    expect(client.calls.some((call) => call.sql.includes('FROM card_versions'))).toBe(false);
    expect(client.calls.some((call) => call.sql === 'ROLLBACK')).toBe(true);
  });

  it('distinguishes a missing target from a version that left the review queue', async () => {
    const missing = createClient((sql) => {
      if (sql.includes('FROM admin_role_assignments')) return [{ role: 'content_reviewer' }];
      if (sql.includes('FROM card_versions')) return [];
      return [];
    });
    await expect(
      new PostgresContentReviewStore(poolFor(missing)).recordCheck(actorUserId, checkInput),
    ).resolves.toEqual({ status: 'not_found' });

    const gone = createClient((sql) => {
      if (sql.includes('FROM admin_role_assignments')) return [{ role: 'content_reviewer' }];
      if (sql.includes('FROM card_versions')) return [{ id: cardVersionId, status: 'approved' }];
      return [];
    });
    await expect(
      new PostgresContentReviewStore(poolFor(gone)).recordCheck(actorUserId, checkInput),
    ).resolves.toEqual({ status: 'not_reviewable', currentStatus: 'approved' });
  });

  it('accepts only the six fixed dimensions and passed/failed outcomes', async () => {
    const store = new PostgresContentReviewStore(poolFor(createClient(() => [])));
    await expect(
      store.recordCheck(actorUserId, { ...checkInput, dimension: 'editorial_quality' as never }),
    ).rejects.toThrow('unknown review dimension');
    await expect(
      store.recordCheck(actorUserId, { ...checkInput, outcome: 'pending' as never }),
    ).rejects.toThrow('check outcome must be passed or failed');
    await expect(
      store.recordCheck(actorUserId, { ...checkInput, notes: 'x'.repeat(1_201) }),
    ).rejects.toThrow('Content review note is too long.');
    await expect(
      store.recordCheck(actorUserId, { ...checkInput, idempotencyKey: 'not-a-uuid' }),
    ).rejects.toThrow('Idempotency key is invalid.');
  });
});

describe('PostgresContentReviewStore final decisions', () => {
  const submission = {
    actorUserId,
    cardVersionId,
    action: 'approve' as const,
    decisionKey,
    reason: 'همهٔ شش بُعد بررسی شدند.',
  };

  it('approves only after all six checks pass, atomically, with audit and without publishing', async () => {
    const client = createClient((sql) => {
      if (sql.includes('FROM admin_role_assignments')) return [{ role: 'content_reviewer' }];
      if (sql.includes('FROM content_review_decisions WHERE decision_key')) return [];
      if (sql.includes('FROM card_versions')) return [versionRow];
      if (sql.includes('FROM content_review_checks')) return [];
      if (sql.includes('INSERT INTO content_review_decisions')) return [{ action: 'approve' }];
      if (sql.includes('UPDATE card_versions')) return [];
      return [];
    });
    const store = new PostgresContentReviewStore(poolFor(client));

    await expect(store.submitDecision(submission)).resolves.toEqual({
      status: 'applied',
      nextStatus: 'approved',
    });
    const statements = client.calls.map(({ sql }) => sql.split(/\s+/)[0]);
    expect(statements).toEqual([
      'BEGIN',
      'SELECT',
      'SELECT',
      'SELECT',
      'SELECT',
      'INSERT',
      'UPDATE',
      'INSERT',
      'COMMIT',
    ]);
    const update = client.calls.find((call) => call.sql.startsWith('UPDATE card_versions'));
    expect(update?.params).toEqual([cardVersionId, 'approved']);
    const audit = client.calls.find((call) => call.sql.includes('INSERT INTO audit_logs'));
    expect(audit?.params).toEqual([
      actorUserId,
      'content_review.approve',
      cardVersionId,
      decisionKey,
    ]);
    expect(client.calls.some((call) => call.sql.includes("status = 'published'"))).toBe(false);
  });

  it('blocks approval while any dimension is not passed and writes no decision', async () => {
    const client = createClient((sql) => {
      if (sql.includes('FROM admin_role_assignments')) return [{ role: 'content_reviewer' }];
      if (sql.includes('FROM content_review_decisions WHERE decision_key')) return [];
      if (sql.includes('FROM card_versions')) return [versionRow];
      if (sql.includes('FROM content_review_checks')) {
        return [{ dimension: 'audio' }, { dimension: 'provenance' }];
      }
      return [];
    });
    const store = new PostgresContentReviewStore(poolFor(client));

    await expect(store.submitDecision(submission)).resolves.toEqual({
      status: 'review_incomplete',
      pendingDimensions: ['audio', 'provenance'],
    });
    expect(client.calls.some((call) => call.sql === 'ROLLBACK')).toBe(true);
    expect(
      client.calls.some((call) => call.sql.includes('INSERT INTO content_review_decisions')),
    ).toBe(false);
    expect(client.calls.some((call) => call.sql.startsWith('UPDATE card_versions'))).toBe(false);
  });

  it('keeps reject and return_for_revision truthful: rejected or needs_review, never published', async () => {
    const reject = createClient((sql) => {
      if (sql.includes('FROM admin_role_assignments')) return [{ role: 'super_admin' }];
      if (sql.includes('FROM content_review_decisions WHERE decision_key')) return [];
      if (sql.includes('FROM card_versions')) return [versionRow];
      if (sql.includes('INSERT INTO content_review_decisions')) return [{ action: 'reject' }];
      return [];
    });
    await expect(
      new PostgresContentReviewStore(poolFor(reject)).submitDecision({
        ...submission,
        action: 'reject',
      }),
    ).resolves.toEqual({ status: 'applied', nextStatus: 'rejected' });

    const returned = createClient((sql) => {
      if (sql.includes('FROM admin_role_assignments')) return [{ role: 'content_reviewer' }];
      if (sql.includes('FROM content_review_decisions WHERE decision_key')) return [];
      if (sql.includes('FROM card_versions')) return [versionRow];
      if (sql.includes('INSERT INTO content_review_decisions'))
        return [{ action: 'return_for_revision' }];
      return [];
    });
    await expect(
      new PostgresContentReviewStore(poolFor(returned)).submitDecision({
        ...submission,
        action: 'return_for_revision',
      }),
    ).resolves.toEqual({ status: 'applied', nextStatus: 'needs_review' });
    expect(
      returned.calls.find((call) => call.sql.startsWith('UPDATE content_review_checks'))?.params,
    ).toEqual([cardVersionId]);
  });

  it('replays an identical decision idempotently and conflicts on key or target mismatch', async () => {
    const replay = createClient((sql) => {
      if (sql.includes('FROM admin_role_assignments')) return [{ role: 'content_reviewer' }];
      if (sql.includes('FROM content_review_decisions WHERE decision_key')) {
        return [{ card_version_id: cardVersionId, action: 'approve' }];
      }
      return [];
    });
    await expect(
      new PostgresContentReviewStore(poolFor(replay)).submitDecision(submission),
    ).resolves.toEqual({
      status: 'idempotent',
      action: 'approve',
    });

    const mismatchedTarget = createClient((sql) => {
      if (sql.includes('FROM admin_role_assignments')) return [{ role: 'content_reviewer' }];
      if (sql.includes('FROM content_review_decisions WHERE decision_key')) {
        return [{ card_version_id: '99999999-9999-4999-8999-999999999999', action: 'approve' }];
      }
      return [];
    });
    await expect(
      new PostgresContentReviewStore(poolFor(mismatchedTarget)).submitDecision(submission),
    ).resolves.toEqual({ status: 'conflict' });
  });

  it('rejects a publisher-only actor before reading the target content', async () => {
    const client = createClient((sql) => {
      if (sql.includes('FROM admin_role_assignments')) return [];
      return [];
    });
    const store = new PostgresContentReviewStore(poolFor(client));

    await expect(store.submitDecision(submission)).resolves.toEqual({ status: 'forbidden' });
    expect(client.calls.some((call) => call.sql.includes('FROM card_versions'))).toBe(false);
  });

  it('refuses a decision for a missing version or one that left the review queue', async () => {
    const missing = createClient((sql) => {
      if (sql.includes('FROM admin_role_assignments')) return [{ role: 'content_reviewer' }];
      if (sql.includes('FROM content_review_decisions WHERE decision_key')) return [];
      if (sql.includes('FROM card_versions')) return [];
      return [];
    });
    await expect(
      new PostgresContentReviewStore(poolFor(missing)).submitDecision(submission),
    ).resolves.toEqual({
      status: 'not_found',
    });

    const approved = createClient((sql) => {
      if (sql.includes('FROM admin_role_assignments')) return [{ role: 'content_reviewer' }];
      if (sql.includes('FROM content_review_decisions WHERE decision_key')) return [];
      if (sql.includes('FROM card_versions')) return [{ id: cardVersionId, status: 'approved' }];
      return [];
    });
    await expect(
      new PostgresContentReviewStore(poolFor(approved)).submitDecision(submission),
    ).resolves.toEqual({ status: 'not_reviewable', currentStatus: 'approved' });
  });
});
