import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { Pool as PgPool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PostgresContentLifecycleStore } from '../lib/server/postgres-content-lifecycle-store.js';
import { PostgresContentReviewStore } from '../lib/server/postgres-content-review-store.js';
import {
  contentReviewDimensions,
  type ContentReviewDimension,
} from '../lib/server/postgres-content-review-store.js';

/**
 * Phase 1 / Milestone 1.6 — the content lifecycle against a REAL Postgres with every repo
 * migration applied, proving the end-to-end claim the milestone exists to make:
 *
 *   Admin publish -> canonical persisted published state -> authenticated learner curriculum
 *
 * The REAL lifecycle store and the REAL review store run; nothing is stubbed. Learner visibility
 * is asserted with the curriculum predicate taken verbatim from the website learner read model,
 * and a drift guard fails if that file ever stops requiring both published statuses — so this
 * suite cannot keep passing while the learner contract moves underneath it.
 *
 * Requires TEST_DATABASE_URL (an empty database; the suite creates and drops its own database).
 */

const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');
const suite = url ? describe : describe.skip;
const dbName = `m16_${Math.random().toString(36).slice(2, 10)}`;
const repoRoot = join(__dirname, '../../..');
const migrationsDir = join(repoRoot, 'database/migrations');

/**
 * Verbatim from apps/website/lib/learner-read-model.ts (CURRICULUM_CTE): a card is learner content
 * only when it has a PUBLISHED version AND belongs to a PUBLISHED pack.
 */
const CURRICULUM_SQL = `
  SELECT DISTINCT pc.card_id
  FROM pack_cards pc
  JOIN packs p ON p.id = pc.pack_id AND p.status = 'published'
  JOIN card_versions cv ON cv.card_id = pc.card_id AND cv.status = 'published'`;

let pool: PgPool;
let admin: PgPool;
let lifecycle: PostgresContentLifecycleStore;
let review: PostgresContentReviewStore;

const packId = 'm16-start';
const aiPackId = 'm16-ai';
const operator = randomUUID();
const learner = randomUUID();
const cards: { cardId: string; versionId: string; contentId: string }[] = [];
let aiCard: { cardId: string; versionId: string };

function surrogateUuid(value: string): string {
  const digest = createHash('sha256').update(`learnbox.pack:${value}`).digest('hex');
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `5${digest.slice(13, 16)}`,
    ((parseInt(digest.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0') +
      digest.slice(18, 20),
    digest.slice(20, 32),
  ].join('-');
}

function cardContent(contentId: string, lemma: string, article: string, provider: string) {
  return {
    id: contentId,
    version: 1,
    status: 'draft',
    lemma,
    article,
    partOfSpeech: 'noun',
    cefr: 'A1',
    persianMeanings: ['معنی'],
    examples: [{ german: `${article} ${lemma} ist hier.`, persian: 'این‌جاست.' }],
    media: [],
    source: { provider, reference: 'Goethe A1 scope reference; linguistic review recorded.' },
  };
}

async function seedCard(pack: string, contentId: string, lemma: string, provider: string) {
  const cardId = randomUUID();
  await pool.query('INSERT INTO cards (id, lemma, content_id) VALUES ($1, $2, $3)', [
    cardId,
    lemma,
    contentId,
  ]);
  const inserted = await pool.query(
    `INSERT INTO card_versions (card_id, version, status, content_json, source_provider)
     VALUES ($1, 1, 'draft', $2::jsonb, $3)
     RETURNING id`,
    [cardId, JSON.stringify(cardContent(contentId, lemma, 'der', provider)), provider],
  );
  await pool.query('INSERT INTO pack_cards (pack_id, card_id, sort_order) VALUES ($1, $2, $3)', [
    pack,
    cardId,
    cards.length + 1,
  ]);
  return { cardId, versionId: String(inserted.rows[0].id), contentId };
}

/** Drives the real review store through all six canonical dimensions, then approves. */
async function humanApprove(versionId: string) {
  for (const dimension of contentReviewDimensions as readonly ContentReviewDimension[]) {
    const result = await review.recordCheck(operator, {
      cardVersionId: versionId,
      dimension,
      outcome: 'passed',
      idempotencyKey: randomUUID(),
    });
    expect(result.status).toBe('applied');
  }
  const decision = await review.submitDecision({
    actorUserId: operator,
    cardVersionId: versionId,
    action: 'approve',
    decisionKey: randomUUID(),
  });
  expect(decision).toMatchObject({ status: 'applied', nextStatus: 'approved' });
}

async function curriculumCardIds(): Promise<string[]> {
  const result = await pool.query(CURRICULUM_SQL);
  return result.rows.map((row) => String(row.card_id)).sort();
}

async function statuses(pack: string) {
  const packRow = await pool.query('SELECT status, published_at FROM packs WHERE id = $1', [pack]);
  const versions = await pool.query(
    `SELECT cv.status, cv.published_at
       FROM pack_cards pc
       JOIN card_versions cv ON cv.card_id = pc.card_id
      WHERE pc.pack_id = $1
      ORDER BY cv.id`,
    [pack],
  );
  return {
    pack: String(packRow.rows[0].status),
    packPublishedAt: packRow.rows[0].published_at as Date | null,
    cards: versions.rows.map((row) => String(row.status)),
    cardPublishedAt: versions.rows.map((row) => row.published_at as Date | null),
  };
}

beforeAll(async () => {
  const { Pool } = await import('pg');
  admin = new Pool({ connectionString: url, max: 1 });
  admin.on('error', () => undefined);
  await admin.query(`CREATE DATABASE ${dbName}`);
  const scoped = new URL(url as string);
  scoped.pathname = `/${dbName}`;
  pool = new Pool({ connectionString: scoped.toString(), max: 4 });
  pool.on('error', () => undefined);

  for (const file of readdirSync(migrationsDir)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort()) {
    await pool.query(readFileSync(join(migrationsDir, file), 'utf8'));
  }

  lifecycle = new PostgresContentLifecycleStore(pool as never);
  review = new PostgresContentReviewStore(pool as never);

  await pool.query('INSERT INTO users (id, phone_e164) VALUES ($1, $2), ($3, $4)', [
    operator,
    '+989120000001',
    learner,
    '+989120000002',
  ]);
  // One operator holds both canonical roles; the role split itself is proven by the unit suite.
  await pool.query(
    `INSERT INTO admin_role_assignments (user_id, role)
     VALUES ($1, 'content_reviewer'), ($1, 'content_publisher')`,
    [operator],
  );
  await pool.query(
    `INSERT INTO packs (id, display_name, target_item_count, status, is_free)
     VALUES ($1, 'M1.6 start', 2, 'draft', true),
            ($2, 'M1.6 ai', 1, 'draft', true)`,
    [packId, aiPackId],
  );
  cards.push(await seedCard(packId, 'm16-tisch', 'Tisch', 'editorial'));
  cards.push(await seedCard(packId, 'm16-stuhl', 'Stuhl', 'editorial'));
  aiCard = await seedCard(aiPackId, 'm16-ai-apfel', 'Apfel', 'ai_suggestion');
});

afterAll(async () => {
  await pool?.end();
  await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin?.end();
});

suite('M1.6 — the learner contract this milestone must not break', () => {
  it('still requires BOTH a published pack and a published version in the learner read model', () => {
    const source = readFileSync(join(repoRoot, 'apps/website/lib/learner-read-model.ts'), 'utf8');
    expect(source).toContain("JOIN packs p ON p.id = pc.pack_id AND p.status = 'published'");
    expect(source).toContain(
      "JOIN card_versions cv ON cv.card_id = pc.card_id AND cv.status = 'published'",
    );
  });

  it('shows no learner content before anything is published', async () => {
    expect(await curriculumCardIds()).toEqual([]);
  });
});

suite('M1.6 — draft to review', () => {
  it('moves drafts into the human queue and makes them visible to the review store', async () => {
    // Migration 0017 seeds the 35 real Start candidates, so the queue is asserted relative to
    // that baseline rather than against an empty table.
    const before = await review.listReviewQueue(operator);
    if (before.status !== 'ok') throw new Error('expected queue');
    const baseline = before.items.map((entry) => entry.contentId);
    expect(baseline).not.toContain('m16-tisch');
    expect(baseline).not.toContain('m16-stuhl');

    const result = await lifecycle.submitPackForReview({
      packId,
      actorUserId: operator,
      idempotencyKey: randomUUID(),
      expectedStatus: 'draft',
    });
    expect(result).toMatchObject({ status: 'applied', submittedCardCount: 2 });

    const state = await statuses(packId);
    expect(state.pack).toBe('needs_review');
    expect(state.cards).toEqual(['needs_review', 'needs_review']);

    const after = await review.listReviewQueue(operator);
    if (after.status !== 'ok') throw new Error('expected queue');
    const added = after.items
      .map((entry) => entry.contentId)
      .filter((contentId) => !baseline.includes(contentId))
      .sort();
    expect(added).toEqual(['m16-stuhl', 'm16-tisch']);
    // Submission alone never publishes.
    expect(await curriculumCardIds()).toEqual([]);
  });

  it('audits the submission under the canonical pack surrogate identity', async () => {
    const audit = await pool.query(
      `SELECT action, entity_type, entity_id, metadata
         FROM audit_logs
        WHERE action LIKE 'content_lifecycle.submit%'
        ORDER BY action`,
    );
    expect(audit.rows).toHaveLength(3);
    const packRow = audit.rows.find((row) => row.entity_type === 'pack');
    expect(packRow?.action).toBe('content_lifecycle.submit_pack_for_review');
    expect(String(packRow?.entity_id)).toBe(surrogateUuid(packId));
    expect((packRow?.metadata as Record<string, unknown>).pack_id).toBe(packId);
  });

  it('refuses a second submission carrying the same idempotency key', async () => {
    const key = randomUUID();
    await pool.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, 'content_lifecycle.submit_pack_for_review', 'pack', $2, $3)`,
      [operator, surrogateUuid(packId), { pack_id: packId, idempotency_key: key }],
    );
    const result = await lifecycle.submitPackForReview({
      packId,
      actorUserId: operator,
      idempotencyKey: key,
    });
    expect(result.status).toBe('idempotent');
  });
});

suite('M1.6 — publish is gated on real review state', () => {
  it('refuses to publish content that has not been approved, and changes nothing', async () => {
    const result = await lifecycle.publishPack({
      packId,
      actorUserId: operator,
      idempotencyKey: randomUUID(),
    });
    if (result.status !== 'not_ready') throw new Error('expected not_ready');
    expect(result.readiness.cardBlockers.map((blocker) => blocker.code)).toEqual([
      'not_approved',
      'not_approved',
    ]);

    const state = await statuses(packId);
    expect(state.pack).toBe('needs_review');
    expect(state.cards).toEqual(['needs_review', 'needs_review']);
    expect(await curriculumCardIds()).toEqual([]);
  });

  it('refuses to publish a partially approved pack', async () => {
    await humanApprove(cards[0]!.versionId);
    const result = await lifecycle.publishPack({
      packId,
      actorUserId: operator,
      idempotencyKey: randomUUID(),
    });
    if (result.status !== 'not_ready') throw new Error('expected not_ready');
    expect(result.readiness.publishableCardCount).toBe(1);
    expect(await curriculumCardIds()).toEqual([]);
  });

  it('refuses a publish authorised against a stale lifecycle view', async () => {
    await humanApprove(cards[1]!.versionId);
    const result = await lifecycle.publishPack({
      packId,
      actorUserId: operator,
      idempotencyKey: randomUUID(),
      expectedStatus: 'draft',
    });
    expect(result).toMatchObject({ status: 'stale', currentStatus: 'needs_review' });
    expect(await curriculumCardIds()).toEqual([]);
  });

  it('publishes a fully approved pack and makes it learner curriculum', async () => {
    const readiness = await lifecycle.getPackLifecycle({ packId, actorUserId: operator });
    if (readiness.status !== 'ok') throw new Error('expected ok');
    expect(readiness.view.readiness.ready).toBe(true);
    expect(readiness.view.canPublish).toBe(true);

    const result = await lifecycle.publishPack({
      packId,
      actorUserId: operator,
      idempotencyKey: randomUUID(),
      expectedStatus: 'needs_review',
    });
    expect(result).toMatchObject({ status: 'applied', publishedCardCount: 2 });

    const state = await statuses(packId);
    expect(state.pack).toBe('published');
    expect(state.packPublishedAt).toBeInstanceOf(Date);
    expect(state.cards).toEqual(['published', 'published']);
    for (const at of state.cardPublishedAt) expect(at).toBeInstanceOf(Date);

    // THE milestone claim: Admin publish alone makes the content learner-visible.
    expect(await curriculumCardIds()).toEqual([cards[0]!.cardId, cards[1]!.cardId].sort());
  });

  it('records the approving human on the published version without rewriting provenance', async () => {
    const result = await pool.query(
      `SELECT content_json->'source' AS source, content_json->>'status' AS status
         FROM card_versions WHERE id = $1`,
      [cards[0]!.versionId],
    );
    const source = result.rows[0].source as Record<string, unknown>;
    expect(result.rows[0].status).toBe('published');
    expect(source.provider).toBe('editorial');
    expect(source.reviewedBy).toBe(operator);
  });

  it('audits the release per card and per pack', async () => {
    const audit = await pool.query(
      `SELECT action, entity_type, metadata
         FROM audit_logs
        WHERE action IN ('content_lifecycle.publish', 'content_lifecycle.publish_pack')`,
    );
    expect(audit.rows.filter((row) => row.action === 'content_lifecycle.publish')).toHaveLength(2);
    const packRow = audit.rows.find((row) => row.action === 'content_lifecycle.publish_pack');
    expect((packRow?.metadata as Record<string, unknown>).published_card_count).toBe(2);
    expect((packRow?.metadata as Record<string, unknown>).previous_status).toBe('needs_review');
  });

  it('is idempotent on an already published pack', async () => {
    const result = await lifecycle.publishPack({
      packId,
      actorUserId: operator,
      idempotencyKey: randomUUID(),
    });
    expect(result.status).toBe('idempotent');
    expect((await statuses(packId)).pack).toBe('published');
  });
});

suite('M1.6 — AI output cannot bypass human publication', () => {
  it('refuses to publish AI-sourced content that no human approved', async () => {
    await lifecycle.submitPackForReview({
      packId: aiPackId,
      actorUserId: operator,
      idempotencyKey: randomUUID(),
    });
    const notApproved = await lifecycle.publishPack({
      packId: aiPackId,
      actorUserId: operator,
      idempotencyKey: randomUUID(),
    });
    if (notApproved.status !== 'not_ready') throw new Error('expected not_ready');
    expect(notApproved.readiness.cardBlockers[0]?.code).toBe('not_approved');

    // Forcing the version to `approved` WITHOUT a recorded review decision is still refused,
    // because the canonical rule demands a named human reviewer for AI-sourced content.
    await pool.query(`UPDATE card_versions SET status = 'approved' WHERE id = $1`, [
      aiCard.versionId,
    ]);
    const forged = await lifecycle.publishPack({
      packId: aiPackId,
      actorUserId: operator,
      idempotencyKey: randomUUID(),
    });
    if (forged.status !== 'not_ready') throw new Error('expected not_ready');
    expect(forged.readiness.cardBlockers[0]?.code).toBe('unreviewed_ai_content');
    expect((await curriculumCardIds()).includes(aiCard.cardId)).toBe(false);
  });

  it('publishes AI-sourced content once a human review decision exists, keeping provenance', async () => {
    await pool.query(`UPDATE card_versions SET status = 'needs_review' WHERE id = $1`, [
      aiCard.versionId,
    ]);
    await humanApprove(aiCard.versionId);
    const result = await lifecycle.publishPack({
      packId: aiPackId,
      actorUserId: operator,
      idempotencyKey: randomUUID(),
    });
    expect(result).toMatchObject({ status: 'applied', publishedCardCount: 1 });

    const row = await pool.query(
      `SELECT content_json->'source' AS source FROM card_versions WHERE id = $1`,
      [aiCard.versionId],
    );
    const source = row.rows[0].source as Record<string, unknown>;
    expect(source.provider).toBe('ai_suggestion');
    expect(source.reviewedBy).toBe(operator);
    expect(await curriculumCardIds()).toContain(aiCard.cardId);
  });
});

suite('M1.6 — archive preserves history', () => {
  it('removes archived content from the curriculum without destroying learner history', async () => {
    // Real learner history on a published card, which must survive deactivation.
    await pool.query(
      `INSERT INTO card_schedules (user_id, card_id, state, stability_days, due_at)
       VALUES ($1, $2, 'review'::learning_state, 5, now() + interval '1 day')`,
      [learner, cards[0]!.cardId],
    );
    await pool.query(
      `INSERT INTO review_events (id, user_id, card_id, grade, occurred_at, client_event_id)
       VALUES ($1, $2, $3, 'remembered', now(), $4)`,
      [randomUUID(), learner, cards[0]!.cardId, randomUUID()],
    );

    const result = await lifecycle.archivePack({
      packId,
      actorUserId: operator,
      idempotencyKey: randomUUID(),
      expectedStatus: 'published',
    });
    expect(result).toMatchObject({ status: 'applied', deactivatedCardCount: 2 });

    const state = await statuses(packId);
    expect(state.pack).toBe('archived');
    expect(state.cards).toEqual(['deprecated', 'deprecated']);

    // The archived pack leaves the curriculum; the independently published AI pack stays.
    expect(await curriculumCardIds()).toEqual([aiCard.cardId]);

    // Nothing historical was deleted.
    const schedules = await pool.query(
      'SELECT count(*)::int AS count FROM card_schedules WHERE card_id = $1',
      [cards[0]!.cardId],
    );
    const events = await pool.query(
      'SELECT count(*)::int AS count FROM review_events WHERE card_id = $1',
      [cards[0]!.cardId],
    );
    const versions = await pool.query(
      'SELECT count(*)::int AS count FROM card_versions WHERE card_id = $1',
      [cards[0]!.cardId],
    );
    expect(schedules.rows[0].count).toBe(1);
    expect(events.rows[0].count).toBe(1);
    expect(versions.rows[0].count).toBe(1);
  });

  it('audits the deactivation and refuses to republish an archived pack', async () => {
    const audit = await pool.query(
      `SELECT action FROM audit_logs WHERE action LIKE 'content_lifecycle.%'
        AND action IN ('content_lifecycle.deprecate', 'content_lifecycle.archive_pack')`,
    );
    expect(audit.rows.filter((row) => row.action === 'content_lifecycle.deprecate')).toHaveLength(
      2,
    );
    expect(
      audit.rows.filter((row) => row.action === 'content_lifecycle.archive_pack'),
    ).toHaveLength(1);

    const republish = await lifecycle.publishPack({
      packId,
      actorUserId: operator,
      idempotencyKey: randomUUID(),
    });
    if (republish.status !== 'not_ready') throw new Error('expected not_ready');
    expect(republish.readiness.blockers.map((blocker) => blocker.code)).toContain(
      'pack_not_publishable',
    );
  });

  it('is idempotent on an already archived pack', async () => {
    const result = await lifecycle.archivePack({
      packId,
      actorUserId: operator,
      idempotencyKey: randomUUID(),
    });
    expect(result.status).toBe('idempotent');
  });
});
