import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { Pool as PgPool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  learnerScreens,
  maximumActiveSlides,
  parseSafeExternalUrl as adminParseSafeExternalUrl,
} from '../../admin/lib/server/presentation-slide';
import { PostgresPresentationSlidesStore } from '../../admin/lib/server/postgres-presentation-slides-store';
import {
  deliverableScreens,
  learnerSlideImageSql,
  learnerSlidesSql,
  maximumDeliveredSlides,
  parseSafeExternalUrl,
  readDeliverableDestination,
  toDeliveredSlides,
} from '../lib/learner-slider';

/**
 * Phase 4 / Milestone 4.3 — the learner slider against a REAL Postgres with every repo migration
 * applied, driven by the REAL M4.2 Admin store.
 *
 * This is a cross-app claim and is therefore tested as one, exactly like M3.2: the Admin Slider
 * Manager writes genuine `banners` rows through its own store, and the canonical learner delivery
 * rule (`apps/website/lib/learner-slider.ts`) is asked what a learner would receive. Mocking either
 * side would let the two agree with each other while production disagreed — which here means an
 * operator publishing a slide no learner ever sees, or a retired slide that keeps being served.
 *
 * What it is built to catch:
 *   - an Admin edit that never reaches the learner read path
 *   - a deactivated, expired or not-yet-started slide still delivered
 *   - more than three slides reaching a learner, including from a legacy row state
 *   - one unusable legacy row silently costing the learner a real slide
 *   - an unsafe or unnavigable destination handed to the app
 *   - private image bytes or internal scheduling metadata inside a learner payload
 *   - image bytes outliving the slide's own delivery rule
 *   - the learner rule and the Admin rule drifting apart
 *   - delivery needing a database privilege the learner role does not have
 *
 * Requires TEST_DATABASE_URL (an empty database; the suite creates and drops its own).
 */

const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');
const suite = url ? describe : describe.skip;
const dbName = `m43_${Math.random().toString(36).slice(2, 10)}`;
const repoRoot = join(__dirname, '../../..');
const migrationsDir = join(repoRoot, 'database/migrations');

let pool: PgPool;
let admin: PgPool;
let store: PostgresPresentationSlidesStore;

const operator = randomUUID();
const packId = 'm43-slide-pack';

/** Bytes the Admin would have stored: already normalized to WebP by the upload route. */
const webpBytes = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x1a, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 '),
  Buffer.from([0x0e, 0x00, 0x00, 0x00]),
  Buffer.from(Array.from({ length: 14 }, (_, index) => index + 1)),
]);

/** What the learner's own read path would return right now. */
async function deliveredSlides() {
  const result = await pool.query(learnerSlidesSql);
  return toDeliveredSlides(result.rows);
}

async function deliveredImage(slideId: string) {
  const result = await pool.query(learnerSlideImageSql, [slideId]);
  return (result.rows[0]?.image_data as Buffer | undefined) ?? null;
}

/** A slide authored exactly the way the Admin Slider Manager authors one. */
async function authorSlide(input: {
  title: string;
  description?: string | null;
  destination: Parameters<PostgresPresentationSlidesStore['upsertSlide']>[0]['destination'];
  isActive?: boolean;
  withImage?: boolean;
}) {
  const created = await store.upsertSlide({
    title: input.title,
    description: input.description ?? null,
    destination: input.destination,
    isActive: input.isActive ?? true,
    imageBytes: input.withImage === false ? undefined : webpBytes,
    actorUserId: operator,
    idempotencyKey: randomUUID(),
  });
  if (created.status !== 'applied') throw new Error(`authoring failed: ${created.status}`);
  return created.row;
}

async function deactivateEverything() {
  await pool.query('UPDATE banners SET is_active = false');
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

  await pool.query(
    `INSERT INTO users (id, phone_e164, first_name) VALUES ($1, '+989****4301', 'اپراتور')`,
    [operator],
  );
  await pool.query(
    `INSERT INTO admin_role_assignments (user_id, role) VALUES ($1, 'super_admin')`,
    [operator],
  );
  await pool.query(
    `INSERT INTO packs (id, display_name, target_item_count, is_free, status)
     VALUES ($1, 'بستهٔ اسلاید', 10, true, 'published')`,
    [packId],
  );
  // Rows that predate the Slider Manager, mirroring the Production sample banners.
  await pool.query(
    `INSERT INTO banners (id, title, description, image_url, background_color, link_url, link_type, sort_order, is_active)
     VALUES ('m43_legacy_ok', 'بنر قدیمی معتبر', NULL, 'https://cdn.example.com/legacy.png', '#123456', 'words', 'screen', 50, false),
            ('m43_legacy_bad', 'بنر قدیمی ناسالم', NULL, NULL, '#123456', 'http://promo.example.com/x', 'url', 51, false)`,
  );

  store = new PostgresPresentationSlidesStore(pool as never);
});

afterAll(async () => {
  await pool?.end();
  if (admin) {
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin.end();
  }
});

suite('M4.3 — a genuine Admin edit reaches the learner read path', () => {
  it('delivers a slide the Admin just created, with its title, description and destination', async () => {
    await deactivateEverything();
    const slide = await authorSlide({
      title: 'بسته‌های تازه',
      description: 'همین حالا ببین',
      destination: { kind: 'screen', screen: 'store' },
    });

    const delivered = await deliveredSlides();
    expect(delivered).toEqual([
      {
        id: slide.id,
        title: 'بسته‌های تازه',
        description: 'همین حالا ببین',
        backgroundColor: '#1e293b',
        destination: { kind: 'screen', screen: 'store' },
        hasImage: true,
      },
    ]);
  });

  it('shows an Admin edit of the same slide without any other change', async () => {
    await deactivateEverything();
    const slide = await authorSlide({
      title: 'عنوان اول',
      destination: { kind: 'screen', screen: 'today' },
    });
    const edited = await store.upsertSlide({
      slideId: slide.id,
      title: 'عنوان ویرایش‌شده',
      description: 'توضیح تازه',
      destination: { kind: 'screen', screen: 'progress' },
      isActive: true,
      actorUserId: operator,
      idempotencyKey: randomUUID(),
    });
    expect(edited.status).toBe('applied');

    const delivered = await deliveredSlides();
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({
      id: slide.id,
      title: 'عنوان ویرایش‌شده',
      description: 'توضیح تازه',
      destination: { kind: 'screen', screen: 'progress' },
    });
  });

  it('stops delivering a slide the Admin deactivated, without deleting it', async () => {
    await deactivateEverything();
    const slide = await authorSlide({
      title: 'بنر بازنشسته',
      destination: { kind: 'screen', screen: 'words' },
    });
    expect((await deliveredSlides()).map((row) => row.id)).toEqual([slide.id]);

    const retired = await store.upsertSlide({
      slideId: slide.id,
      title: 'بنر بازنشسته',
      description: null,
      destination: { kind: 'screen', screen: 'words' },
      isActive: false,
      actorUserId: operator,
      idempotencyKey: randomUUID(),
    });
    expect(retired.status).toBe('applied');

    expect(await deliveredSlides()).toEqual([]);
    const row = await pool.query('SELECT is_active FROM banners WHERE id = $1', [slide.id]);
    expect(row.rows[0]).toEqual({ is_active: false });
  });
});

suite('M4.3 — how many slides a learner receives', () => {
  it('delivers at most three even when the table holds more active rows than the Admin allows', async () => {
    await deactivateEverything();
    // Deliberately NOT via the Admin store: it refuses a fourth active slide. This is the legacy /
    // manual-edit state the delivery cap exists for.
    for (let index = 0; index < 5; index += 1) {
      await pool.query(
        `INSERT INTO banners (id, title, link_url, link_type, sort_order, is_active)
         VALUES ($1, $2, 'today', 'screen', $3, true)`,
        [`m43_many_${index}`, `بنر ${index}`, index],
      );
    }
    const delivered = await deliveredSlides();
    expect(delivered).toHaveLength(maximumDeliveredSlides);
    expect(delivered.map((row) => row.id)).toEqual(['m43_many_0', 'm43_many_1', 'm43_many_2']);
    await pool.query(`DELETE FROM banners WHERE id LIKE 'm43_many_%'`);
  });

  it('does not let one unusable legacy row cost the learner a real slide', async () => {
    await deactivateEverything();
    const first = await authorSlide({
      title: 'اسلاید یک',
      destination: { kind: 'screen', screen: 'today' },
    });
    const second = await authorSlide({ title: 'اسلاید دو', destination: { kind: 'pack', packId } });
    const third = await authorSlide({
      title: 'اسلاید سه',
      destination: { kind: 'screen', screen: 'store' },
    });
    // A legacy row with a destination the product will not navigate to, active and ordered FIRST.
    // Written directly because the Admin counts it against the limit and would refuse a fourth —
    // which is exactly why the delivery side cannot assume there are only three candidates.
    await pool.query(
      `UPDATE banners SET is_active = true, sort_order = -10 WHERE id = 'm43_legacy_bad'`,
    );

    const delivered = await deliveredSlides();
    expect(delivered.map((row) => row.id)).toEqual([first.id, second.id, third.id]);
    expect(delivered).toHaveLength(3);
  });

  it('delivers nothing at all when no slide is active', async () => {
    await deactivateEverything();
    expect(await deliveredSlides()).toEqual([]);
  });
});

suite('M4.3 — scheduling and ordering', () => {
  it('respects the existing scheduling window on both ends', async () => {
    await deactivateEverything();
    const live = await authorSlide({
      title: 'در بازه',
      destination: { kind: 'screen', screen: 'today' },
    });
    const future = await authorSlide({
      title: 'آینده',
      destination: { kind: 'screen', screen: 'words' },
    });
    const past = await authorSlide({
      title: 'گذشته',
      destination: { kind: 'screen', screen: 'progress' },
    });
    await pool.query(`UPDATE banners SET starts_at = NOW() + INTERVAL '1 day' WHERE id = $1`, [
      future.id,
    ]);
    await pool.query(`UPDATE banners SET ends_at = NOW() - INTERVAL '1 day' WHERE id = $1`, [
      past.id,
    ]);

    expect((await deliveredSlides()).map((row) => row.id)).toEqual([live.id]);
  });

  it('keeps a deterministic order: sort_order, then newest authored, then id', async () => {
    await deactivateEverything();
    await pool.query(
      `INSERT INTO banners (id, title, link_url, link_type, sort_order, is_active, created_at)
       VALUES ('m43_order_b', 'دوم', 'today', 'screen', 5, true, '2026-01-01T00:00:00Z'),
              ('m43_order_a', 'سوم', 'words', 'screen', 5, true, '2026-01-01T00:00:00Z'),
              ('m43_order_first', 'اول', 'store', 'screen', 1, true, '2025-01-01T00:00:00Z')`,
    );
    const first = (await deliveredSlides()).map((row) => row.id);
    expect(first).toEqual(['m43_order_first', 'm43_order_a', 'm43_order_b']);

    // The same rows read again produce the same order, which is what "deterministic" has to mean.
    expect((await deliveredSlides()).map((row) => row.id)).toEqual(first);
    await pool.query(`DELETE FROM banners WHERE id LIKE 'm43_order_%'`);
  });
});

suite('M4.3 — destinations the learner may be sent to', () => {
  it('delivers the Store, a specific Pack and a safe external link', async () => {
    await deactivateEverything();
    const storeSlide = await authorSlide({
      title: 'فروشگاه',
      destination: { kind: 'screen', screen: 'store' },
    });
    const packSlide = await authorSlide({ title: 'بسته', destination: { kind: 'pack', packId } });
    const linkSlide = await authorSlide({
      title: 'پیوند بیرونی',
      destination: { kind: 'url', url: 'https://learnboxapp.com/blog/post' },
    });

    const byId = new Map((await deliveredSlides()).map((row) => [row.id, row.destination]));
    expect(byId.get(storeSlide.id)).toEqual({ kind: 'screen', screen: 'store' });
    expect(byId.get(packSlide.id)).toEqual({ kind: 'pack', packId });
    expect(byId.get(linkSlide.id)).toEqual({
      kind: 'url',
      url: 'https://learnboxapp.com/blog/post',
    });
  });

  it('refuses to deliver a destination the product will not navigate to', async () => {
    await deactivateEverything();
    const rejected = [
      ['m43_bad_http', 'url', 'http://promo.example.com/x'],
      ['m43_bad_js', 'url', 'javascript:alert(1)'],
      ['m43_bad_data', 'url', 'data:text/html;base64,PHA+'],
      ['m43_bad_ip', 'url', 'https://10.0.0.7/admin'],
      ['m43_bad_internal', 'url', 'https://db.internal/metrics'],
      ['m43_bad_port', 'url', 'https://example.com:8443/x'],
      ['m43_bad_creds', 'url', 'https://user:secret@example.com/x'],
      ['m43_bad_screen', 'screen', 'settings'],
      ['m43_bad_pack', 'pack', 'Not A Pack Id'],
    ] as const;
    // A link_type outside the column's own CHECK cannot be stored at all, so the mapper is asked
    // directly: an unknown kind is not navigable either.
    expect(readDeliverableDestination('promo', 'today')).toBeUndefined();
    for (const [id, linkType, linkUrl] of rejected) {
      await pool.query(
        `INSERT INTO banners (id, title, link_url, link_type, is_active)
         VALUES ($1, 'نامعتبر', $2, $3, true)
         ON CONFLICT (id) DO UPDATE SET link_url = $2, link_type = $3, is_active = true`,
        [id, linkUrl, linkType],
      );
    }
    await pool.query(
      `INSERT INTO banners (id, title, link_url, link_type, is_active)
       VALUES ('m43_bad_null', 'بدون مقصد', NULL, 'screen', true)`,
    );

    expect(await deliveredSlides()).toEqual([]);
    await pool.query(`DELETE FROM banners WHERE id LIKE 'm43_bad_%'`);
  });

  it('agrees with the Admin about every external URL, rule for rule', async () => {
    const cases = [
      'https://learnboxapp.com/x',
      'https://sub.domain.example.com/a/b?c=d#e',
      'http://learnboxapp.com/x',
      'HTTPS://LEARNBOXAPP.COM/x',
      'javascript:alert(1)',
      'data:text/plain,hi',
      'intent://scan#Intent;scheme=zxing;end',
      'https://user:pw@learnboxapp.com/x',
      'https://learnboxapp.com:8443/x',
      'https://127.0.0.1/x',
      'https://10.1.2.3/x',
      'https://[::1]/x',
      'https://localhost/x',
      'https://box.local/x',
      'https://service.internal/x',
      'https://nodot/x',
      `https://learnboxapp.com/${'a'.repeat(600)}`,
      '',
      ' https://learnboxapp.com/x',
    ];
    for (const candidate of cases) {
      expect([candidate, parseSafeExternalUrl(candidate)]).toEqual([
        candidate,
        adminParseSafeExternalUrl(candidate),
      ]);
    }
  });

  it('agrees with the Admin about the screens and the maximum', () => {
    expect([...deliverableScreens].sort()).toEqual([...learnerScreens].sort());
    expect(maximumDeliveredSlides).toBe(maximumActiveSlides);
  });

  it('reads a stored destination exactly as the Admin stored it', async () => {
    await deactivateEverything();
    const packSlide = await authorSlide({ title: 'بسته', destination: { kind: 'pack', packId } });
    const stored = await pool.query<{ link_type: string; link_url: string }>(
      'SELECT link_type, link_url FROM banners WHERE id = $1',
      [packSlide.id],
    );
    expect(readDeliverableDestination(stored.rows[0].link_type, stored.rows[0].link_url)).toEqual({
      kind: 'pack',
      packId,
    });
  });
});

suite('M4.3 — what a learner payload may and may not contain', () => {
  it('carries no image bytes, no legacy image URL and no scheduling metadata', async () => {
    await deactivateEverything();
    await pool.query(
      `UPDATE banners SET is_active = true, image_url = 'https://cdn.example.com/legacy.png'
        WHERE id = 'm43_legacy_ok'`,
    );
    const slide = await authorSlide({
      title: 'با تصویر',
      destination: { kind: 'screen', screen: 'today' },
    });

    const rawColumns = Object.keys((await pool.query(learnerSlidesSql)).rows[0] ?? {});
    expect(rawColumns).not.toContain('image_data');
    expect(rawColumns).not.toContain('image_url');
    expect(rawColumns).not.toContain('link_target');

    const delivered = await deliveredSlides();
    const keys = Object.keys(delivered.find((row) => row.id === slide.id) ?? {}).sort();
    expect(keys).toEqual([
      'backgroundColor',
      'description',
      'destination',
      'hasImage',
      'id',
      'title',
    ]);
    expect(JSON.stringify(delivered)).not.toContain('cdn.example.com');
  });

  it('reports only WHETHER a slide has an image, and reports it truthfully', async () => {
    await deactivateEverything();
    const withImage = await authorSlide({
      title: 'با تصویر',
      destination: { kind: 'screen', screen: 'today' },
    });
    // A pre-existing row that never had canonical bytes: the carousel must be told so, or it would
    // ask for an image that does not exist on every render.
    await pool.query(`UPDATE banners SET is_active = true WHERE id = 'm43_legacy_ok'`);

    const delivered = await deliveredSlides();
    expect(delivered.find((row) => row.id === withImage.id)?.hasImage).toBe(true);
    expect(delivered.find((row) => row.id === 'm43_legacy_ok')?.hasImage).toBe(false);
    expect(JSON.stringify(delivered)).not.toContain('RIFF');
  });
});

suite('M4.3 — slide image delivery', () => {
  it('delivers the exact bytes the Admin uploaded', async () => {
    await deactivateEverything();
    const slide = await authorSlide({
      title: 'تصویر واقعی',
      destination: { kind: 'screen', screen: 'today' },
    });
    const bytes = await deliveredImage(slide.id);
    expect(bytes).not.toBeNull();
    expect(Buffer.compare(bytes as Buffer, webpBytes)).toBe(0);
  });

  it('stops delivering the image when the slide stops being delivered', async () => {
    await deactivateEverything();
    const slide = await authorSlide({
      title: 'تصویر بازنشسته',
      destination: { kind: 'screen', screen: 'today' },
    });
    expect(await deliveredImage(slide.id)).not.toBeNull();

    await store.upsertSlide({
      slideId: slide.id,
      title: 'تصویر بازنشسته',
      description: null,
      destination: { kind: 'screen', screen: 'today' },
      isActive: false,
      actorUserId: operator,
      idempotencyKey: randomUUID(),
    });
    expect(await deliveredImage(slide.id)).toBeNull();

    // ...and an expired slide is no different from a deactivated one.
    await pool.query(
      `UPDATE banners SET is_active = true, ends_at = NOW() - INTERVAL '1 hour' WHERE id = $1`,
      [slide.id],
    );
    expect(await deliveredImage(slide.id)).toBeNull();
  });

  it('has no image to deliver for a slide that never had one', async () => {
    await deactivateEverything();
    await pool.query(`UPDATE banners SET is_active = true WHERE id = 'm43_legacy_ok'`);
    expect(await deliveredImage('m43_legacy_ok')).toBeNull();
  });
});

suite('M4.3 — delivery needs no new database privilege', () => {
  it('runs the whole learner rule as a role holding only SELECT on banners', async () => {
    await deactivateEverything();
    const slide = await authorSlide({
      title: 'حق دسترسی',
      destination: { kind: 'screen', screen: 'today' },
    });

    const roleName = `m43_reader_${Math.random().toString(36).slice(2, 8)}`;
    const password = randomUUID();
    await pool.query(`CREATE ROLE ${roleName} LOGIN PASSWORD '${password}'`);
    await pool.query(`GRANT CONNECT ON DATABASE ${dbName} TO ${roleName}`);
    await pool.query(`GRANT USAGE ON SCHEMA public TO ${roleName}`);
    await pool.query(`GRANT SELECT ON banners TO ${roleName}`);

    const { Pool } = await import('pg');
    const scoped = new URL(url as string);
    scoped.pathname = `/${dbName}`;
    scoped.username = roleName;
    scoped.password = password;
    const reader = new Pool({ connectionString: scoped.toString(), max: 1 });
    reader.on('error', () => undefined);
    try {
      const slides = toDeliveredSlides((await reader.query(learnerSlidesSql)).rows);
      expect(slides.map((row) => row.id)).toEqual([slide.id]);
      const image = await reader.query(learnerSlideImageSql, [slide.id]);
      expect(Buffer.compare(image.rows[0].image_data as Buffer, webpBytes)).toBe(0);
      // The same role cannot change what it serves.
      await expect(
        reader.query(`UPDATE banners SET is_active = false WHERE id = $1`, [slide.id]),
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await reader.end();
      await pool.query(`REVOKE ALL ON banners FROM ${roleName}`);
      await pool.query(`REVOKE USAGE ON SCHEMA public FROM ${roleName}`);
      await pool.query(`REVOKE CONNECT ON DATABASE ${dbName} FROM ${roleName}`);
      await pool.query(`DROP ROLE ${roleName}`);
    }
  });
});
