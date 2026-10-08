import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { Pool as PgPool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PostgresPresentationSlidesStore } from '../lib/server/postgres-presentation-slides-store.js';
import { maximumActiveSlides } from '../lib/server/presentation-slide.js';

/**
 * Phase 4 / Milestone 4.2 — the Slider Manager against a REAL Postgres with every repo migration
 * applied, proving the claims the milestone exists to make:
 *
 *   - a super_admin manages REAL `banners` rows (create, edit, activate, deactivate, reorder)
 *   - at most three slides are active, and that holds for CONCURRENT activations
 *   - an invalid destination is refused by the server
 *   - slide image bytes are stored canonically, served only to a super_admin, never listed
 *   - every write is audited, and a replayed request changes nothing
 *   - nothing is deleted, no pre-existing banner is disturbed, the learner contract is unchanged
 *   - the role needs only INSERT and UPDATE on `banners` — never DELETE
 *
 * The REAL store runs; nothing is stubbed. Requires TEST_DATABASE_URL (the suite creates and drops
 * its own database).
 */

const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');
const suite = url ? describe : describe.skip;
const dbName = `m42_${Math.random().toString(36).slice(2, 10)}`;
const probeRole = `m42_admin_${Math.random().toString(36).slice(2, 8)}`;
const probePassword = randomUUID();
const repoRoot = join(__dirname, '../../..');
const migrationsDir = join(repoRoot, 'database/migrations');

/**
 * Verbatim from apps/website/app/api/banners/route.ts. Copied rather than imported because the
 * route builds its own pool from DATABASE_URL; the drift guard below fails if the route's rule
 * ever stops matching this copy, so the copy cannot silently go stale.
 */
const LEARNER_BANNERS_SQL = `SELECT id, title, description, image_url, background_color, link_url, link_type, link_target
       FROM banners
       WHERE is_active = true
         AND (starts_at IS NULL OR starts_at <= NOW())
         AND (ends_at IS NULL OR ends_at >= NOW())
         AND link_type = 'screen'
         AND link_url IN ('today', 'words', 'progress', 'profile')
       ORDER BY sort_order ASC, created_at DESC
       LIMIT 5`;

let pool: PgPool;
let admin: PgPool;
let rolePool: PgPool;
let store: PostgresPresentationSlidesStore;
let roleStore: PostgresPresentationSlidesStore;

const operator = randomUUID();
const publisher = randomUUID();
const packId = 'm42-pack';
let slideImage: Buffer;
let wideImage: Buffer;

async function clearActive() {
  await pool.query('UPDATE banners SET is_active = false');
}

async function activeIds(): Promise<string[]> {
  const result = await pool.query('SELECT id FROM banners WHERE is_active = true ORDER BY id');
  return result.rows.map((row) => String(row.id));
}

async function auditRows(bannerId: string) {
  const result = await pool.query(
    `SELECT action, actor_user_id, entity_type, metadata
       FROM audit_logs
      WHERE entity_type = 'presentation_slide' AND metadata->>'banner_id' = $1
      ORDER BY created_at, action`,
    [bannerId],
  );
  return result.rows;
}

/** Creates a slide with image bytes and asserts it landed, returning its id. */
async function createSlide(
  overrides: Partial<Parameters<PostgresPresentationSlidesStore['upsertSlide']>[0]> = {},
) {
  const result = await store.upsertSlide({
    title: 'اسلاید آزمون',
    description: null,
    destination: { kind: 'screen', screen: 'today' },
    isActive: false,
    imageBytes: slideImage,
    actorUserId: operator,
    idempotencyKey: randomUUID(),
    ...overrides,
  });
  expect(result.status).toBe('applied');
  if (result.status !== 'applied') throw new Error('slide creation failed');
  return result.row;
}

beforeAll(async () => {
  const { Pool } = await import('pg');
  const sharp = (await import('sharp')).default;
  slideImage = await sharp({
    create: { width: 1280, height: 640, channels: 3, background: '#5b3df5' },
  })
    .webp()
    .toBuffer();
  wideImage = await sharp({
    create: { width: 1600, height: 500, channels: 3, background: '#1f6b3f' },
  })
    .webp()
    .toBuffer();

  admin = new Pool({ connectionString: url, max: 1 });
  admin.on('error', () => undefined);
  await admin.query(`CREATE DATABASE ${dbName}`);

  const scoped = new URL(url as string);
  scoped.pathname = `/${dbName}`;
  pool = new Pool({ connectionString: scoped.toString(), max: 8 });
  pool.on('error', () => undefined);

  for (const file of readdirSync(migrationsDir)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort()) {
    await pool.query(readFileSync(join(migrationsDir, file), 'utf8'));
  }

  await pool.query('INSERT INTO users (id, phone_e164) VALUES ($1, $2), ($3, $4)', [
    operator,
    '+989****4201',
    publisher,
    '+989****4202',
  ]);
  await pool.query(
    `INSERT INTO admin_role_assignments (user_id, role)
     VALUES ($1, 'super_admin'), ($2, 'content_publisher')`,
    [operator, publisher],
  );
  await pool.query(
    `INSERT INTO packs (id, display_name, target_item_count, status, is_free)
     VALUES ($1, 'M4.2 pack', 1, 'published', true)`,
    [packId],
  );

  // A role holding ONLY what db-roles-p0.sql and migration 0031 grant the Admin on `banners`,
  // used to prove the Slider Manager needs no further privilege — and no DELETE.
  await pool.query(`CREATE ROLE ${probeRole} LOGIN PASSWORD '${probePassword}'`);
  await pool.query(`GRANT USAGE ON SCHEMA public TO ${probeRole}`);
  await pool.query(`GRANT SELECT ON banners, packs, admin_role_assignments TO ${probeRole}`);
  await pool.query(`GRANT INSERT, UPDATE ON banners TO ${probeRole}`);
  await pool.query(`GRANT INSERT ON audit_logs TO ${probeRole}`);
  await pool.query(`GRANT SELECT ON audit_logs TO ${probeRole}`);

  const roleUrl = new URL(scoped.toString());
  roleUrl.username = probeRole;
  roleUrl.password = probePassword;
  rolePool = new Pool({ connectionString: roleUrl.toString(), max: 2 });
  rolePool.on('error', () => undefined);

  store = new PostgresPresentationSlidesStore(pool as never);
  roleStore = new PostgresPresentationSlidesStore(rolePool as never);
});

afterAll(async () => {
  await rolePool?.end();
  await pool?.end();
  await admin?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin?.end();
});

suite('M4.2 — an authorized Admin manages real banner rows', () => {
  it('creates a draft slide, stores canonical image bytes and audits the creation', async () => {
    const key = randomUUID();
    const result = await store.upsertSlide({
      title: 'اسلاید اول',
      description: 'توضیح کوتاه',
      destination: { kind: 'screen', screen: 'today' },
      isActive: false,
      imageBytes: slideImage,
      actorUserId: operator,
      idempotencyKey: key,
    });
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') return;
    expect(result.row).toMatchObject({
      title: 'اسلاید اول',
      description: 'توضیح کوتاه',
      destination: { kind: 'screen', screen: 'today' },
      isActive: false,
      hasImage: true,
    });

    const stored = await pool.query(
      `SELECT link_type, link_url, image_url, starts_at, ends_at,
              octet_length(image_data) AS bytes
         FROM banners WHERE id = $1`,
      [result.row.id],
    );
    expect(stored.rows[0]).toMatchObject({ link_type: 'screen', link_url: 'today' });
    // M4.2 never writes the legacy external URL column and ships no scheduling.
    expect(stored.rows[0].image_url).toBeNull();
    expect(stored.rows[0].starts_at).toBeNull();
    expect(stored.rows[0].ends_at).toBeNull();
    expect(Number(stored.rows[0].bytes)).toBe(slideImage.byteLength);

    const audits = await auditRows(result.row.id);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'presentation_slide.created',
      actor_user_id: operator,
      entity_type: 'presentation_slide',
    });
    expect(audits[0].metadata).toMatchObject({
      idempotency_key: key,
      is_active: false,
      destination_kind: 'screen',
      destination: 'today',
      image_replaced: true,
      banner_id: result.row.id,
    });
  });

  it('edits a slide, replaces its image and audits the update', async () => {
    const slide = await createSlide({ title: 'قبل از ویرایش' });
    const result = await store.upsertSlide({
      slideId: slide.id,
      title: 'بعد از ویرایش',
      description: null,
      destination: { kind: 'pack', packId },
      isActive: false,
      imageBytes: wideImage,
      actorUserId: operator,
      idempotencyKey: randomUUID(),
    });
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') return;
    expect(result.row).toMatchObject({
      title: 'بعد از ویرایش',
      destination: { kind: 'pack', packId },
    });
    const bytes = await pool.query(
      'SELECT octet_length(image_data) AS bytes FROM banners WHERE id = $1',
      [slide.id],
    );
    expect(Number(bytes.rows[0].bytes)).toBe(wideImage.byteLength);
    expect((await auditRows(slide.id)).map((row) => row.action)).toEqual([
      'presentation_slide.created',
      'presentation_slide.updated',
    ]);
  });

  it('keeps an existing image when an edit carries no new bytes', async () => {
    const slide = await createSlide();
    const result = await store.upsertSlide({
      slideId: slide.id,
      title: 'عنوان تازه',
      description: null,
      destination: { kind: 'screen', screen: 'words' },
      isActive: false,
      actorUserId: operator,
      idempotencyKey: randomUUID(),
    });
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') return;
    expect(result.row.hasImage).toBe(true);
    const audit = await auditRows(slide.id);
    expect(audit.at(-1)?.metadata).toMatchObject({ image_replaced: false });
  });
});

suite('M4.2 — the server rejects what the UI must not be trusted to prevent', () => {
  it('refuses to activate a slide that has no canonical image bytes', async () => {
    await clearActive();
    const created = await store.upsertSlide({
      title: 'بدون تصویر',
      description: null,
      destination: { kind: 'screen', screen: 'today' },
      isActive: false,
      actorUserId: operator,
      idempotencyKey: randomUUID(),
    });
    expect(created.status).toBe('applied');
    if (created.status !== 'applied') return;
    expect(created.row.hasImage).toBe(false);

    const activation = await store.upsertSlide({
      slideId: created.row.id,
      title: 'بدون تصویر',
      description: null,
      destination: { kind: 'screen', screen: 'today' },
      isActive: true,
      actorUserId: operator,
      idempotencyKey: randomUUID(),
    });
    expect(activation.status).toBe('image_required');
    expect(await activeIds()).not.toContain(created.row.id);
    // A refused activation writes nothing at all, including no audit row.
    expect(await auditRows(created.row.id)).toHaveLength(1);
  });

  it('rejects a pack destination that does not exist', async () => {
    const result = await store.upsertSlide({
      title: 'بستهٔ ناموجود',
      description: null,
      destination: { kind: 'pack', packId: 'm42-missing-pack' },
      isActive: false,
      imageBytes: slideImage,
      actorUserId: operator,
      idempotencyKey: randomUUID(),
    });
    expect(result.status).toBe('unknown_pack');
    const rows = await pool.query(
      `SELECT count(*)::int AS total FROM banners WHERE link_url = $1`,
      ['m42-missing-pack'],
    );
    expect(rows.rows[0].total).toBe(0);
  });

  it('refuses every write from an Admin who is not a super_admin', async () => {
    const slide = await createSlide();
    expect(await store.listSlides({ actorUserId: publisher })).toEqual({ status: 'forbidden' });
    expect(await store.readSlideImage({ slideId: slide.id, actorUserId: publisher })).toEqual({
      status: 'forbidden',
    });
    expect(
      await store.upsertSlide({
        slideId: slide.id,
        title: 'تلاش بدون نقش',
        description: null,
        destination: { kind: 'screen', screen: 'today' },
        isActive: true,
        actorUserId: publisher,
        idempotencyKey: randomUUID(),
      }),
    ).toEqual({ status: 'forbidden' });
    expect(
      await store.reorderSlides({
        order: [slide.id],
        actorUserId: publisher,
        idempotencyKey: randomUUID(),
      }),
    ).toEqual({ status: 'forbidden' });
    const audits = await auditRows(slide.id);
    expect(audits.every((row) => row.actor_user_id === operator)).toBe(true);
  });

  it('refuses a mutation whose idempotency key is not a canonical uuid', async () => {
    const result = await store.upsertSlide({
      title: 'کلید نامعتبر',
      description: null,
      destination: { kind: 'screen', screen: 'today' },
      isActive: false,
      imageBytes: slideImage,
      actorUserId: operator,
      idempotencyKey: 'not-a-uuid',
    });
    expect(result.status).toBe('forbidden');
  });
});

suite('M4.2 — the three-active maximum is a database invariant', () => {
  it('admits exactly three of five CONCURRENT activations', async () => {
    await clearActive();
    const slides = await Promise.all([
      createSlide({ title: 'هم‌زمان ۱' }),
      createSlide({ title: 'هم‌زمان ۲' }),
      createSlide({ title: 'هم‌زمان ۳' }),
      createSlide({ title: 'هم‌زمان ۴' }),
      createSlide({ title: 'هم‌زمان ۵' }),
    ]);

    const results = await Promise.all(
      slides.map((slide) =>
        store.upsertSlide({
          slideId: slide.id,
          title: slide.title,
          description: null,
          destination: { kind: 'screen', screen: 'today' },
          isActive: true,
          actorUserId: operator,
          idempotencyKey: randomUUID(),
        }),
      ),
    );

    const applied = results.filter((result) => result.status === 'applied');
    const refused = results.filter((result) => result.status === 'active_limit_reached');
    expect(applied).toHaveLength(maximumActiveSlides);
    expect(refused).toHaveLength(slides.length - maximumActiveSlides);
    expect(await activeIds()).toHaveLength(maximumActiveSlides);

    // Only the activations that succeeded are in the trail.
    const activated = await pool.query(
      `SELECT count(*)::int AS total FROM audit_logs
        WHERE action = 'presentation_slide.activated' AND metadata->>'banner_id' = ANY($1::text[])`,
      [slides.map((slide) => slide.id)],
    );
    expect(activated.rows[0].total).toBe(maximumActiveSlides);
  });

  it('lets a fourth slide in only after one is deactivated, and audits both sides', async () => {
    const active = await activeIds();
    expect(active).toHaveLength(maximumActiveSlides);
    const candidate = await createSlide({ title: 'چهارمی' });

    const blocked = await store.upsertSlide({
      slideId: candidate.id,
      title: 'چهارمی',
      description: null,
      destination: { kind: 'screen', screen: 'today' },
      isActive: true,
      actorUserId: operator,
      idempotencyKey: randomUUID(),
    });
    expect(blocked).toMatchObject({
      status: 'active_limit_reached',
      activeCount: maximumActiveSlides,
    });

    const freed = await store.upsertSlide({
      slideId: active[0],
      title: 'آزاد شد',
      description: null,
      destination: { kind: 'screen', screen: 'today' },
      isActive: false,
      actorUserId: operator,
      idempotencyKey: randomUUID(),
    });
    expect(freed.status).toBe('applied');
    expect((await auditRows(active[0])).at(-1)?.action).toBe('presentation_slide.deactivated');

    const admitted = await store.upsertSlide({
      slideId: candidate.id,
      title: 'چهارمی',
      description: null,
      destination: { kind: 'screen', screen: 'today' },
      isActive: true,
      actorUserId: operator,
      idempotencyKey: randomUUID(),
    });
    expect(admitted.status).toBe('applied');
    expect(await activeIds()).toHaveLength(maximumActiveSlides);
  });

  it('keeps an already-active slide editable without re-counting it', async () => {
    const active = await activeIds();
    const result = await store.upsertSlide({
      slideId: active[0],
      title: 'ویرایش در حال فعال بودن',
      description: 'هنوز فعال',
      destination: { kind: 'screen', screen: 'progress' },
      isActive: true,
      actorUserId: operator,
      idempotencyKey: randomUUID(),
    });
    expect(result.status).toBe('applied');
    expect(await activeIds()).toHaveLength(maximumActiveSlides);
  });
});

suite('M4.2 — replays are safe and nothing is destroyed', () => {
  it('replays a create without creating a second slide', async () => {
    const key = randomUUID();
    const input = {
      title: 'یک‌بار ساخته می‌شود',
      description: null,
      destination: { kind: 'screen' as const, screen: 'words' as const },
      isActive: false,
      imageBytes: slideImage,
      actorUserId: operator,
      idempotencyKey: key,
    };
    const first = await store.upsertSlide(input);
    const second = await store.upsertSlide(input);
    expect(first.status).toBe('applied');
    expect(second.status).toBe('idempotent');
    if (first.status !== 'applied' || second.status !== 'idempotent') return;
    expect(second.row.id).toBe(first.row.id);

    const count = await pool.query(`SELECT count(*)::int AS total FROM banners WHERE title = $1`, [
      input.title,
    ]);
    expect(count.rows[0].total).toBe(1);
    expect(await auditRows(first.row.id)).toHaveLength(1);
  });

  it('replays an activation without a second audit row or a second slot', async () => {
    await clearActive();
    const slide = await createSlide({ title: 'فعال‌سازی تکراری' });
    const key = randomUUID();
    const activation = {
      slideId: slide.id,
      title: slide.title,
      description: null,
      destination: { kind: 'screen' as const, screen: 'today' as const },
      isActive: true,
      actorUserId: operator,
      idempotencyKey: key,
    };
    expect((await store.upsertSlide(activation)).status).toBe('applied');
    expect((await store.upsertSlide(activation)).status).toBe('idempotent');
    expect(await auditRows(slide.id)).toHaveLength(2);
    expect(await activeIds()).toEqual([slide.id]);
  });

  it('never deletes a slide: a deactivated slide keeps its row and its bytes', async () => {
    const slide = await createSlide({ title: 'نگه داشته می‌شود' });
    const before = await pool.query(`SELECT count(*)::int AS total FROM banners`);
    const deactivated = await store.upsertSlide({
      slideId: slide.id,
      title: slide.title,
      description: null,
      destination: { kind: 'screen', screen: 'today' },
      isActive: false,
      actorUserId: operator,
      idempotencyKey: randomUUID(),
    });
    expect(deactivated.status).toBe('applied');
    const after = await pool.query(
      `SELECT (SELECT count(*)::int FROM banners) AS total,
              (SELECT octet_length(image_data) FROM banners WHERE id = $1) AS bytes`,
      [slide.id],
    );
    expect(after.rows[0].total).toBe(before.rows[0].total);
    expect(Number(after.rows[0].bytes)).toBe(slideImage.byteLength);
  });

  /**
   * The change and its trail are ONE transaction, so a write that cannot be audited does not
   * happen. Proven by failing the audit INSERT on a real connection: if the slide write were
   * committed before the audit, the row would survive here with no trail behind it.
   */
  it('abandons the slide write when its audit row cannot be written', async () => {
    const title = 'بدون رد در گزارش';
    const before = await pool.query(`SELECT count(*)::int AS total FROM banners`);
    const unauditable = {
      connect: async () => {
        const client = await pool.connect();
        return {
          query: (sql: string, parameters?: readonly unknown[]) =>
            sql.includes('INSERT INTO audit_logs')
              ? Promise.reject(new Error('audit sink unavailable'))
              : client.query(sql, parameters as never),
          release: () => client.release(),
        };
      },
    };
    const unauditableStore = new PostgresPresentationSlidesStore(unauditable as never);

    await expect(
      unauditableStore.upsertSlide({
        title,
        description: null,
        destination: { kind: 'screen', screen: 'today' },
        isActive: false,
        imageBytes: slideImage,
        actorUserId: operator,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow('audit sink unavailable');

    const after = await pool.query(
      `SELECT (SELECT count(*)::int FROM banners) AS total,
              (SELECT count(*)::int FROM banners WHERE title = $1) AS orphans`,
      [title],
    );
    expect(after.rows[0].orphans).toBe(0);
    expect(after.rows[0].total).toBe(before.rows[0].total);
  });
});

suite('M4.2 — reorder is one transaction over the whole slider', () => {
  it('renumbers every slide and audits the submitted order', async () => {
    const all = await pool.query('SELECT id FROM banners ORDER BY sort_order, created_at, id');
    const order = all.rows.map((row) => String(row.id)).reverse();
    const key = randomUUID();
    const result = await store.reorderSlides({
      order,
      actorUserId: operator,
      idempotencyKey: key,
    });
    expect(result.status).toBe('applied');
    const stored = await pool.query('SELECT id, sort_order FROM banners ORDER BY sort_order');
    expect(stored.rows.map((row) => String(row.id))).toEqual(order);
    expect(stored.rows.map((row) => Number(row.sort_order))).toEqual(
      order.map((_, index) => index),
    );

    const audit = await pool.query(
      `SELECT action, metadata FROM audit_logs
        WHERE action = 'presentation_slide.reordered' AND metadata->>'idempotency_key' = $1`,
      [key],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].metadata).toMatchObject({ order });
  });

  it('rejects a partial order rather than renumbering a subset', async () => {
    const before = await pool.query('SELECT id, sort_order FROM banners ORDER BY sort_order');
    const partial = before.rows.slice(0, 2).map((row) => String(row.id));
    expect(
      await store.reorderSlides({
        order: partial,
        actorUserId: operator,
        idempotencyKey: randomUUID(),
      }),
    ).toEqual({ status: 'invalid_order' });
    const duplicated = before.rows.map(() => String(before.rows[0].id));
    expect(
      await store.reorderSlides({
        order: duplicated,
        actorUserId: operator,
        idempotencyKey: randomUUID(),
      }),
    ).toEqual({ status: 'invalid_order' });
    const after = await pool.query('SELECT id, sort_order FROM banners ORDER BY sort_order');
    expect(after.rows).toEqual(before.rows);
  });

  it('replays a reorder without writing again', async () => {
    const all = await pool.query('SELECT id FROM banners ORDER BY sort_order');
    const order = all.rows.map((row) => String(row.id)).reverse();
    const key = randomUUID();
    expect(
      (await store.reorderSlides({ order, actorUserId: operator, idempotencyKey: key })).status,
    ).toBe('applied');
    const replay = await store.reorderSlides({ order, actorUserId: operator, idempotencyKey: key });
    expect(replay.status).toBe('idempotent');
    const audit = await pool.query(
      `SELECT count(*)::int AS total FROM audit_logs WHERE metadata->>'idempotency_key' = $1`,
      [key],
    );
    expect(audit.rows[0].total).toBe(1);
  });
});

suite('M4.2 — slide image bytes have exactly one authenticated read path', () => {
  it('serves the stored bytes to a super_admin and nothing to anyone else', async () => {
    const slide = await createSlide({ title: 'تصویر خصوصی' });
    const read = await store.readSlideImage({ slideId: slide.id, actorUserId: operator });
    expect(read.status).toBe('ok');
    if (read.status !== 'ok') return;
    expect(read.bytes.equals(slideImage)).toBe(true);
    expect(read.checksum).toMatch(/^[0-9a-f]{64}$/);

    expect(await store.readSlideImage({ slideId: slide.id, actorUserId: publisher })).toEqual({
      status: 'forbidden',
    });
    expect(await store.readSlideImage({ slideId: slide.id, actorUserId: randomUUID() })).toEqual({
      status: 'forbidden',
    });
    expect(
      await store.readSlideImage({ slideId: 'banner_missing', actorUserId: operator }),
    ).toEqual({ status: 'not_found' });
  });

  it('never puts image bytes in the list payload', async () => {
    const listed = await store.listSlides({ actorUserId: operator });
    expect(listed.status).toBe('ok');
    if (listed.status !== 'ok') return;
    expect(listed.rows.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(listed.rows);
    expect(serialized).not.toContain('image_data');
    expect(serialized).not.toContain(slideImage.subarray(0, 12).toString('base64'));
    expect(listed.rows.some((row) => row.hasImage)).toBe(true);
    expect(Object.keys(listed.rows[0])).toEqual([
      'id',
      'title',
      'description',
      'destination',
      'isActive',
      'sortOrder',
      'hasImage',
      'legacyImageUrl',
      'createdAt',
    ]);
  });
});

suite('M4.2 — the Admin role needs INSERT and UPDATE on banners, and no more', () => {
  it('runs the real store under a role that holds only those privileges', async () => {
    await clearActive();
    const created = await roleStore.upsertSlide({
      title: 'با نقش کم‌دسترسی',
      description: null,
      destination: { kind: 'screen', screen: 'today' },
      isActive: true,
      imageBytes: slideImage,
      actorUserId: operator,
      idempotencyKey: randomUUID(),
    });
    expect(created.status).toBe('applied');
    if (created.status !== 'applied') return;

    const edited = await roleStore.upsertSlide({
      slideId: created.row.id,
      title: 'ویرایش با نقش کم‌دسترسی',
      description: null,
      destination: { kind: 'screen', screen: 'store' },
      isActive: false,
      actorUserId: operator,
      idempotencyKey: randomUUID(),
    });
    expect(edited.status).toBe('applied');

    const all = await pool.query('SELECT id FROM banners ORDER BY sort_order, id');
    expect(
      (
        await roleStore.reorderSlides({
          order: all.rows.map((row) => String(row.id)),
          actorUserId: operator,
          idempotencyKey: randomUUID(),
        })
      ).status,
    ).toBe('applied');
  });

  it('cannot delete a banner even though it manages them', async () => {
    const denied = await rolePool
      .query('DELETE FROM banners WHERE id = (SELECT id FROM banners LIMIT 1)')
      .then(
        () => 'allowed',
        (error: { code?: string }) => error.code,
      );
    expect(denied).toBe('42501');
  });
});

suite('M4.2 — the learner contract and the pre-existing banners are untouched', () => {
  it('leaves a pre-existing sample banner exactly as it was, including its external image URL', async () => {
    const sample = await pool.query(
      `INSERT INTO banners (title, description, image_url, link_type, link_url, is_active,
                            background_color, sort_order, starts_at, ends_at)
       VALUES ('نمونهٔ قدیمی', 'ردیف پیش از M4.2', 'https://cdn.example.com/legacy.png',
               'screen', 'today', true, '#123456', 99, NULL, NULL)
       RETURNING id, image_url, background_color, link_target`,
      [],
    );
    const sampleId = String(sample.rows[0].id);

    const listed = await store.listSlides({ actorUserId: operator });
    expect(listed.status).toBe('ok');
    if (listed.status !== 'ok') return;
    const row = listed.rows.find((candidate) => candidate.id === sampleId);
    // A pre-existing row is listed and deactivatable, and its legacy URL is reported, not rewritten.
    expect(row).toMatchObject({
      hasImage: false,
      legacyImageUrl: 'https://cdn.example.com/legacy.png',
      isActive: true,
    });

    const deactivated = await store.upsertSlide({
      slideId: sampleId,
      title: 'نمونهٔ قدیمی',
      description: 'ردیف پیش از M4.2',
      destination: { kind: 'screen', screen: 'today' },
      isActive: false,
      actorUserId: operator,
      idempotencyKey: randomUUID(),
    });
    expect(deactivated.status).toBe('applied');

    const after = await pool.query(
      `SELECT image_url, background_color, link_target, starts_at, ends_at, image_data
         FROM banners WHERE id = $1`,
      [sampleId],
    );
    expect(after.rows[0]).toEqual({
      image_url: 'https://cdn.example.com/legacy.png',
      background_color: '#123456',
      link_target: sample.rows[0].link_target,
      starts_at: null,
      ends_at: null,
      image_data: null,
    });
  });

  it('still serves the learner exactly what it served before: screen slides only, no bytes', async () => {
    const source = readFileSync(join(repoRoot, 'apps/website/app/api/banners/route.ts'), 'utf8');
    // Drift guard: M4.3 owns widening this. If the learner rule changes, the copy above is stale.
    // Compared with comments and indentation collapsed, so reformatting the route is not a failure
    // while any change to the columns, the filters, the order or the limit is.
    const squash = (value: string) =>
      value
        .replace(/--[^\n]*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    expect(squash(source)).toContain(squash(LEARNER_BANNERS_SQL));
    expect(source).not.toContain('image_data');

    await clearActive();
    const storeSlide = await createSlide({ title: 'مقصد فروشگاه' });
    expect(
      (
        await store.upsertSlide({
          slideId: storeSlide.id,
          title: storeSlide.title,
          description: null,
          destination: { kind: 'screen', screen: 'store' },
          isActive: true,
          actorUserId: operator,
          idempotencyKey: randomUUID(),
        })
      ).status,
    ).toBe('applied');
    const packSlide = await createSlide({ title: 'مقصد بسته' });
    expect(
      (
        await store.upsertSlide({
          slideId: packSlide.id,
          title: packSlide.title,
          description: null,
          destination: { kind: 'pack', packId },
          isActive: true,
          actorUserId: operator,
          idempotencyKey: randomUUID(),
        })
      ).status,
    ).toBe('applied');
    const todaySlide = await createSlide({ title: 'مقصد امروز' });
    expect(
      (
        await store.upsertSlide({
          slideId: todaySlide.id,
          title: todaySlide.title,
          description: null,
          destination: { kind: 'screen', screen: 'today' },
          isActive: true,
          actorUserId: operator,
          idempotencyKey: randomUUID(),
        })
      ).status,
    ).toBe('applied');

    const learner = await pool.query(LEARNER_BANNERS_SQL);
    const served = learner.rows.map((row) => String(row.id));
    expect(served).toContain(todaySlide.id);
    // Store and Pack destinations are authored now and delivered in M4.3, so an existing learner
    // build receives neither — and no response column can carry image bytes.
    expect(served).not.toContain(storeSlide.id);
    expect(served).not.toContain(packSlide.id);
    expect(Object.keys(learner.rows[0] ?? {})).not.toContain('image_data');
    expect(learner.rows.length).toBeLessThanOrEqual(5);
  });
});
