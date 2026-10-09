import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { guardForcedTeardown } from './support/forced-teardown-guard';

/**
 * M5 — restricted-role grant matrix against a REAL Postgres.
 *
 * Production does not run as the database owner: the learner runs as `learnbox_app`, the Admin
 * workspace as `learnbox_admin`, and the nightly backup as `learnbox_migrator` (LB-B30). Every
 * other database test in this repository connects as the owner, which means a missing GRANT is
 * invisible to the whole suite — exactly how `review_event_rejections_id_seq` reached production
 * with no privilege for the backup role and silently disabled backups for seven consecutive nights
 * (2026-10-03 .. 2026-10-09).
 *
 * This suite closes that blind spot. It rebuilds the production privilege history in a throwaway
 * database — migrations 0001-0022, then the role cutover (infrastructure/database/db-roles-p0.sql),
 * then migrations 0023-0032, which is the real order the roles were introduced in — connects as
 * each restricted role with its own credential, and executes the SAME statement shapes the shipped
 * code executes. A missing or over-broad grant fails here instead of in production.
 *
 * Requires TEST_DATABASE_URL (a reachable database the test can create databases and roles in);
 * hard-fails in CI if absent, because a skipped privilege suite silently stops guarding the
 * privilege model. Locally:
 *   docker run -d --rm -e POSTGRES_PASSWORD=ci -p 55440:5432 postgres:17-alpine
 *   TEST_DATABASE_URL=postgres://postgres:ci@localhost:55440/postgres \
 *     pnpm --filter @learnbox/website exec vitest run test/db-role-grant-matrix-db.test.ts
 */
const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');

const suite = url ? describe : describe.skip;

const dbName = `roles_${randomBytes(4).toString('hex')}`;
const migrationsDir = join(__dirname, '../../../database/migrations');
const rolesFile = join(__dirname, '../../../infrastructure/database/db-roles-p0.sql');

// Fresh per run and never persisted: these credentials exist only inside this throwaway database.
const passwords = {
  learnbox_app: randomBytes(16).toString('hex'),
  learnbox_admin: randomBytes(16).toString('hex'),
  learnbox_migrator: randomBytes(16).toString('hex'),
};

let admin: Pool; // owner connection to the scratch database (what migrations run as)
let root: Pool; // connection to TEST_DATABASE_URL, used only to create/drop the scratch database
let app: Pool;
let adminRole: Pool;
let migrator: Pool;
const guards: { beginTeardown: () => void }[] = [];

const migrationFiles = (): string[] =>
  readdirSync(migrationsDir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort();

const readMigration = (file: string): string => readFileSync(join(migrationsDir, file), 'utf8');

function roleUrl(role: keyof typeof passwords): string {
  const u = new URL(url as string);
  u.username = role;
  u.password = passwords[role];
  u.pathname = `/${dbName}`;
  return u.toString();
}

const ids = {
  learner: '33333333-3333-4333-8333-333333333333',
  admin: '44444444-4444-4444-8444-444444444444',
  card: '55555555-5555-4555-8555-555555555555',
  candidate: '66666666-6666-4666-8666-666666666666',
  job: '77777777-7777-4777-8777-777777777777',
};
const PACK = 'pack-roles-test';

/** Postgres raises insufficient_privilege (42501) when a grant is missing. */
async function expectDenied(pool: Pool, sql: string, parameters: unknown[] = []): Promise<void> {
  await expect(pool.query(sql, parameters)).rejects.toMatchObject({ code: '42501' });
}

suite('restricted-role grant matrix (real Postgres, real roles)', () => {
  beforeAll(async () => {
    root = new Pool({ connectionString: url, max: 1 });
    guards.push(guardForcedTeardown(root));
    await root.query(`CREATE DATABASE ${dbName}`);

    const scoped = new URL(url as string);
    scoped.pathname = `/${dbName}`;
    admin = new Pool({ connectionString: scoped.toString(), max: 2 });
    guards.push(guardForcedTeardown(admin));

    const files = migrationFiles();
    const upTo0022 = files.filter((f) => f < '0023');
    const from0023 = files.filter((f) => f >= '0023');

    for (const file of upTo0022) await admin.query(readMigration(file));

    // The real role cutover, applied where production applied it: after 0022, before 0023. Its
    // leading REVOKEs are the reason a later migration must grant explicitly — reproducing that
    // order is what makes this test meaningful. `\set` is a psql meta-command, not SQL.
    const rolesSql = readFileSync(rolesFile, 'utf8')
      .split('\n')
      .filter((line) => !line.startsWith('\\'))
      .join('\n');
    await admin.query(rolesSql);

    for (const role of Object.keys(passwords) as (keyof typeof passwords)[]) {
      await admin.query(`ALTER ROLE ${role} WITH PASSWORD '${passwords[role]}'`);
    }

    for (const file of from0023) await admin.query(readMigration(file));

    // Fixtures owned by the owner role: the restricted roles are tested on their own statements,
    // not on their ability to create other surfaces' rows.
    await admin.query(
      `INSERT INTO users (id, phone_e164, first_name) VALUES ($1, '+491700000001', 'learner'), ($2, '+491700000002', 'operator')`,
      [ids.learner, ids.admin],
    );
    await admin.query(
      `INSERT INTO packs (id, display_name, target_item_count, status, price_tomans)
       VALUES ($1, 'Roles Test Pack', 10, 'published', 50000)`,
      [PACK],
    );
    await admin.query(
      `INSERT INTO cards (id, lemma, content_id) VALUES ($1, 'Haus', 'roles-card-1')`,
      [ids.card],
    );

    app = new Pool({ connectionString: roleUrl('learnbox_app'), max: 2 });
    adminRole = new Pool({ connectionString: roleUrl('learnbox_admin'), max: 2 });
    migrator = new Pool({ connectionString: roleUrl('learnbox_migrator'), max: 2 });
    guards.push(
      guardForcedTeardown(app),
      guardForcedTeardown(adminRole),
      guardForcedTeardown(migrator),
    );
  }, 180_000);

  afterAll(async () => {
    for (const guard of guards) guard.beginTeardown();
    await Promise.allSettled([app?.end(), adminRole?.end(), migrator?.end(), admin?.end()]);
    await root?.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    // Roles are cluster-wide; drop them so a reused database server is left as it was found.
    for (const role of Object.keys(passwords)) {
      await root?.query(`DROP ROLE IF EXISTS ${role}`).catch(() => undefined);
    }
    await root?.end();
  });

  it('applies every migration and the role cutover without the owner privileges leaking', async () => {
    const { rows } = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')`,
    );
    expect(Number(rows[0].n)).toBeGreaterThanOrEqual(40);
    for (const role of Object.keys(passwords)) {
      const { rows: r } = await admin.query<{ rolsuper: boolean }>(
        `SELECT rolsuper FROM pg_roles WHERE rolname = $1`,
        [role],
      );
      expect(r[0]?.rolsuper).toBe(false);
    }
  });

  describe('learner runtime (learnbox_app)', () => {
    it('writes the daily plan and a rejected review event', async () => {
      // apps/website/lib/learner-today.ts — plan is written once per learner-local day.
      await app.query(
        `INSERT INTO learner_daily_plans (user_id, local_day, time_zone, new_card_ids)
         VALUES ($1, current_date, 'Europe/Berlin', ARRAY[$2::uuid])
         ON CONFLICT (user_id, local_day) DO NOTHING`,
        [ids.learner, ids.card],
      );
      // apps/website/app/api/learner/progress/route.ts — a rejected sync event is auditable.
      // This INSERT consumes review_event_rejections_id_seq: the sequence at the centre of the
      // backup outage.
      await app.query(
        `INSERT INTO review_event_rejections (user_id, client_event_id, reason)
         VALUES ($1, 'client-evt-1', 'validation')`,
        [ids.learner],
      );
      const { rows } = await app.query(
        `SELECT count(*)::int AS n FROM learner_daily_plans WHERE user_id = $1`,
        [ids.learner],
      );
      expect(rows[0].n).toBe(1);
    });

    it('reads the store catalogue and grants an entitlement on purchase', async () => {
      await admin.query(
        `INSERT INTO store_listings (pack_id, store_status, listed_at) VALUES ($1, 'listed', now())`,
        [PACK],
      );
      // apps/website/lib/store-catalog.ts
      const listing = await app.query(
        `SELECT pack_id, store_status FROM store_listings WHERE store_status = 'listed'`,
      );
      expect(listing.rows).toHaveLength(1);

      // apps/website/lib/store-purchase.ts — initiate, then settle, then grant.
      const created = await app.query<{ id: string }>(
        `INSERT INTO purchase_events
           (user_id, provider, environment, provider_purchase_id, status, pack_id, amount_tomans)
         VALUES ($1, 'zarinpal', 'production', $2, 'pending', $3, 50000)
         RETURNING id`,
        [ids.learner, `auth-${randomBytes(4).toString('hex')}`, PACK],
      );
      await app.query(
        `UPDATE purchase_events SET status = 'verified', verified_at = now(), updated_at = now()
          WHERE id = $1`,
        [created.rows[0].id],
      );
      await app.query(
        `INSERT INTO user_packs (user_id, pack_id, acquisition_type, purchase_event_id)
         VALUES ($1, $2, 'purchased', $3)
         ON CONFLICT (user_id, pack_id) DO NOTHING`,
        [ids.learner, PACK, created.rows[0].id],
      );
      const owned = await app.query(
        `SELECT acquisition_type FROM user_packs WHERE user_id = $1 AND pack_id = $2`,
        [ids.learner, PACK],
      );
      expect(owned.rows[0].acquisition_type).toBe('purchased');
    });

    it('is confined to the learner surface', async () => {
      // Commercial configuration is an operator decision; the learner runtime may only read it.
      await expectDenied(app, `UPDATE store_listings SET featured = true WHERE pack_id = $1`, [
        PACK,
      ]);
      await expectDenied(app, `DELETE FROM store_listings WHERE pack_id = $1`, [PACK]);
      // The Admin-only AI and media surfaces are invisible to the learner credential.
      await expectDenied(app, `SELECT 1 FROM ai_generation_jobs`);
      await expectDenied(app, `SELECT 1 FROM card_media_candidates`);
      await expectDenied(app, `SELECT 1 FROM card_media_objects`);
      // Content and slides stay read-only for the learner.
      await expectDenied(app, `UPDATE cards SET lemma = 'x' WHERE id = $1`, [ids.card]);
      await expectDenied(app, `INSERT INTO banners (title) VALUES ('x')`);
      await expectDenied(app, `UPDATE packs SET price_tomans = 1 WHERE id = $1`, [PACK]);
      // No schema authority.
      await expectDenied(app, `CREATE TABLE learner_cannot_create (id int)`);
    });
  });

  describe('Admin workspace (learnbox_admin)', () => {
    it('runs an AI pack generation job through its lifecycle', async () => {
      // apps/admin/lib/server/ai-pack-generation-service.ts
      await adminRole.query(
        `INSERT INTO ai_generation_jobs
           (id, actor_user_id, prompt, plan, plan_fingerprint, status, requested_count, batch_size)
         VALUES ($1, $2, 'A1 Haus', '{"items":[]}'::jsonb, 'fp-1', 'planned', 10, 5)`,
        [ids.job, ids.admin],
      );
      await adminRole.query(
        `UPDATE ai_generation_jobs SET status = 'generating', next_batch_index = 1, updated_at = now()
          WHERE id = $1`,
        [ids.job],
      );
      const { rows } = await adminRole.query(
        `SELECT status FROM ai_generation_jobs WHERE id = $1`,
        [ids.job],
      );
      expect(rows[0].status).toBe('generating');
    });

    it('stores, accepts and prunes generated card media', async () => {
      const objectKey = `admin/card-media/${PACK}/image/${ids.candidate}.png`;
      // apps/admin/lib/server/card-media-storage.ts
      await adminRole.query(
        `INSERT INTO card_media_objects (object_key, media_type, byte_size, checksum, bytes)
         VALUES ($1, 'image/png', 4, $2, decode('00010203', 'hex'))`,
        [objectKey, 'a'.repeat(64)],
      );
      // apps/admin/lib/server/card-media-generation-service.ts — candidate, then accepted asset.
      await adminRole.query(
        `INSERT INTO card_media_candidates
           (id, card_id, kind, status, object_key, checksum, byte_size, media_type,
            provider, model, capability, image_standard_version)
         VALUES ($1, $2, 'image', 'ready', $3, $4, 4, 'image/png',
            'avalai', 'gpt-image-1', 'image', 'v2')
         ON CONFLICT (id) DO NOTHING`,
        [ids.candidate, ids.card, objectKey, 'a'.repeat(64)],
      );
      await adminRole.query(
        `UPDATE card_media_candidates SET status = 'accepted', updated_at = now() WHERE id = $1`,
        [ids.candidate],
      );
      // The real upsert: ON CONFLICT DO UPDATE needs INSERT *and* UPDATE on the table.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await adminRole.query(
          `INSERT INTO card_media_assets (card_id, kind, candidate_id, accepted_by_user_id)
           VALUES ($1, 'image', $2, $3)
           ON CONFLICT (card_id, kind)
           DO UPDATE SET candidate_id = EXCLUDED.candidate_id, accepted_at = now()`,
          [ids.card, ids.candidate, ids.admin],
        );
      }
      await adminRole.query(`DELETE FROM card_media_objects WHERE object_key = $1`, [objectKey]);
      const { rows } = await adminRole.query(
        `SELECT count(*)::int AS n FROM card_media_assets WHERE card_id = $1`,
        [ids.card],
      );
      expect(rows[0].n).toBe(1);
    });

    it('upserts a store listing and manages slides', async () => {
      // apps/admin/lib/server/postgres-store-listings-store.ts:289 — ON CONFLICT DO UPDATE.
      for (const order of [1, 2]) {
        await adminRole.query(
          `INSERT INTO store_listings (pack_id, store_status, featured, display_order, listed_at)
           VALUES ($1, 'listed', true, $2, now())
           ON CONFLICT (pack_id) DO UPDATE
             SET store_status = EXCLUDED.store_status,
                 featured = EXCLUDED.featured,
                 display_order = EXCLUDED.display_order`,
          [PACK, order],
        );
      }
      const listing = await adminRole.query(
        `SELECT display_order FROM store_listings WHERE pack_id = $1`,
        [PACK],
      );
      expect(listing.rows[0].display_order).toBe(2);

      // M4.2 Slider Manager: insert and update a slide, including the private image bytes.
      await adminRole.query(
        `INSERT INTO banners (id, title, link_type, image_data) VALUES ('banner_roles_test', 'T', 'screen', decode('00', 'hex'))`,
      );
      await adminRole.query(`UPDATE banners SET is_active = false WHERE id = 'banner_roles_test'`);
      const banner = await adminRole.query(
        `SELECT is_active FROM banners WHERE id = 'banner_roles_test'`,
      );
      expect(banner.rows[0].is_active).toBe(false);
    });

    it('reads entitlement and purchase history without payment write authority', async () => {
      const purchases = await adminRole.query(`SELECT count(*)::int AS n FROM purchase_events`);
      expect(purchases.rows[0].n).toBeGreaterThanOrEqual(1);
      const entitlements = await adminRole.query(`SELECT count(*)::int AS n FROM user_packs`);
      expect(entitlements.rows[0].n).toBeGreaterThanOrEqual(1);
      // Support can grant and revoke an entitlement (0029) but must not rewrite payment facts.
      await expectDenied(adminRole, `UPDATE purchase_events SET status = 'verified'`);
      await expectDenied(
        adminRole,
        `INSERT INTO purchase_events
        (user_id, provider, environment, provider_purchase_id, status, pack_id, amount_tomans)
        VALUES ($1, 'zarinpal', 'production', 'forged', 'verified', $2, 1)`,
        [ids.learner, PACK],
      );
    });

    /**
     * Migration 0033 — the content workspace. Every statement below is the one the shipped Admin
     * code runs (apps/admin/lib/server/postgres-content-packs-write-store.ts and
     * postgres-content-lifecycle-store.ts), executed as the restricted role, so a missing grant
     * fails here instead of as a 500 in Production.
     */
    it('creates, edits, publishes and archives content as the restricted Admin role', async () => {
      const newPack = 'roles-admin-pack';
      const newCard = randomUUID();
      await adminRole.query(
        `INSERT INTO packs (id, display_name, target_item_count, status)
         VALUES ($1, 'بستهٔ ادمین', 1, 'draft')`,
        [newPack],
      );
      await adminRole.query(`INSERT INTO cards (id, lemma, content_version, content_id)
         VALUES ($1, 'Apfel', 1, 'roles-admin-card')`, [newCard]);
      const version = await adminRole.query<{ id: string }>(
        `INSERT INTO card_versions (card_id, version, status, content_json, source_provider, source_reference)
         VALUES ($1, 1, 'draft', '{"lemma":"Apfel"}'::jsonb, 'editorial', 'roles-test')
         RETURNING id`,
        [newCard],
      );
      await adminRole.query(
        `INSERT INTO pack_cards (pack_id, card_id, sort_order) VALUES ($1, $2, 1)`,
        [newPack, newCard],
      );

      // In-place draft edit, then the canonical headword mirror on `cards`.
      await adminRole.query(
        `UPDATE card_versions
            SET content_json = '{"lemma":"Apfelbaum"}'::jsonb,
                source_provider = 'editorial',
                source_reference = 'roles-test-2'
          WHERE id = $1`,
        [version.rows[0].id],
      );
      await adminRole.query(`UPDATE cards SET lemma = 'Apfelbaum', content_version = 2 WHERE id = $1`, [
        newCard,
      ]);

      // Submit for review, publish, archive — the whole lifecycle, status only.
      await adminRole.query(`UPDATE card_versions SET status = 'needs_review' WHERE card_id = $1`, [
        newCard,
      ]);
      await adminRole.query(`UPDATE packs SET status = 'needs_review' WHERE id = $1`, [newPack]);
      await adminRole.query(
        `UPDATE card_versions SET status = 'published', published_at = now() WHERE card_id = $1`,
        [newCard],
      );
      await adminRole.query(
        `UPDATE packs SET status = 'published', published_at = COALESCE(published_at, now()) WHERE id = $1`,
        [newPack],
      );
      await adminRole.query(`UPDATE packs SET status = 'archived' WHERE id = $1`, [newPack]);

      const stored = await admin.query(
        `SELECT p.status, c.lemma, v.status AS version_status
           FROM packs p JOIN pack_cards pc ON pc.pack_id = p.id
           JOIN cards c ON c.id = pc.card_id
           JOIN card_versions v ON v.card_id = c.id
          WHERE p.id = $1`,
        [newPack],
      );
      expect(stored.rows[0]).toMatchObject({
        status: 'archived',
        lemma: 'Apfelbaum',
        version_status: 'published',
      });
    });

    it('keeps the deliberate limits of the contained Admin surface', async () => {
      // db-roles-p0.sql: the Slider Manager cannot delete a slide, only deactivate it.
      await expectDenied(adminRole, `DELETE FROM banners WHERE id = 'banner_roles_test'`);
      // 0033 grants content writes, NOT commercial configuration: pricing stays an owner decision.
      await expectDenied(adminRole, `UPDATE packs SET price_tomans = 1 WHERE id = $1`, [PACK]);
      await expectDenied(adminRole, `UPDATE packs SET is_free = false WHERE id = $1`, [PACK]);
      // The learner media/review key is immutable to the Admin role as well as to the trigger.
      await expectDenied(adminRole, `UPDATE cards SET content_id = 'x' WHERE id = $1`, [ids.card]);
      // Content is retired by status, never deleted.
      await expectDenied(adminRole, `DELETE FROM packs WHERE id = $1`, [PACK]);
      await expectDenied(adminRole, `DELETE FROM cards WHERE id = $1`, [ids.card]);
      await expectDenied(adminRole, `DELETE FROM card_versions`);
      await expectDenied(adminRole, `DELETE FROM pack_cards WHERE pack_id = $1`, [PACK]);
      await expectDenied(adminRole, `DELETE FROM users WHERE id = $1`, [ids.learner]);
      // The learner's own learning state is not an Admin-writable surface.
      await expectDenied(adminRole, `DELETE FROM review_events`);
      await expectDenied(adminRole, `UPDATE review_events SET grade = 1`);
      await expectDenied(adminRole, `UPDATE card_schedules SET due_at = now()`);
      await expectDenied(adminRole, `CREATE TABLE admin_cannot_create (id int)`);
    });
  });

  describe('backup role (learnbox_migrator)', () => {
    it('can read every table in the schema', async () => {
      const { rows } = await migrator.query<{ relname: string }>(
        `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY c.relname`,
      );
      expect(rows.length).toBeGreaterThanOrEqual(40);
      const unreadable: string[] = [];
      for (const { relname } of rows) {
        try {
          await migrator.query(`SELECT * FROM public.${relname} LIMIT 1`);
        } catch {
          unreadable.push(relname);
        }
      }
      expect(unreadable).toEqual([]);
    });

    it('can read every sequence exactly as pg_dump does', async () => {
      // THE regression test for the 2026-10 outage. pg_dump issues this statement for every
      // sequence; USAGE (which lets a role call nextval) is not sufficient — it needs SELECT.
      const { rows } = await migrator.query<{ relname: string }>(
        `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind = 'S' ORDER BY c.relname`,
      );
      expect(rows.length).toBeGreaterThanOrEqual(1);
      for (const { relname } of rows) {
        const read = await migrator.query(`SELECT last_value, is_called FROM public.${relname}`);
        expect(read.rows).toHaveLength(1);
      }
    });

    it('reads a table and sequence created AFTER the grant repair with no new grant', async () => {
      // The structural half of 0032: default privileges, so the next migration that adds a table
      // cannot silently break the backup the way 0023 did.
      await admin.query(`CREATE TABLE future_probe (id bigserial PRIMARY KEY, note text)`);
      await admin.query(`INSERT INTO future_probe (note) VALUES ('created after 0032')`);
      const table = await migrator.query(`SELECT note FROM future_probe`);
      expect(table.rows[0].note).toBe('created after 0032');
      const sequence = await migrator.query(
        `SELECT last_value, is_called FROM future_probe_id_seq`,
      );
      expect(sequence.rows).toHaveLength(1);
      await admin.query(`DROP TABLE future_probe`);
    });

    it('records the default privileges in the catalogue', async () => {
      const { rows } = await admin.query<{ objtype: string; acl: string }>(
        `SELECT d.defaclobjtype AS objtype, d.defaclacl::text AS acl
           FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace
          WHERE n.nspname = 'public'`,
      );
      const forTables = rows.find((r) => r.objtype === 'r');
      const forSequences = rows.find((r) => r.objtype === 'S');
      expect(forTables?.acl).toContain('learnbox_migrator=r');
      expect(forSequences?.acl).toContain('learnbox_migrator=r');
      // Least privilege: the application roles get no blanket future access.
      expect(rows.map((r) => r.acl).join(' ')).not.toContain('learnbox_app=');
      expect(rows.map((r) => r.acl).join(' ')).not.toContain('learnbox_admin=');
    });

    it('produces a complete pg_dump with the backup credential', () => {
      // The end-to-end proof of what the nightly job actually runs. pg_dump must match the server
      // major version, so it runs in the same throwaway postgres:17 container image production
      // uses; the DSN is passed by environment, never as an argument (/proc is world-readable).
      let dockerAvailable = true;
      try {
        execFileSync('docker', ['version', '--format', '{{.Server.Version}}'], { stdio: 'pipe' });
      } catch {
        dockerAvailable = false;
      }
      if (!dockerAvailable) {
        if (process.env.CI) throw new Error('docker is required in CI to prove pg_dump succeeds');
        return;
      }

      const dsn = new URL(roleUrl('learnbox_migrator'));
      const args = ['run', '--rm', '-i'];
      if (process.platform === 'linux') {
        args.push('--network', 'host');
      } else if (dsn.hostname === 'localhost' || dsn.hostname === '127.0.0.1') {
        dsn.hostname = 'host.docker.internal';
      }
      args.push(
        '-e',
        `PGURL=${dsn.toString()}`,
        'postgres:17-alpine',
        'sh',
        '-c',
        'pg_dump --no-owner --no-privileges --format=plain "$PGURL"',
      );

      const dump = execFileSync('docker', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      const tables = dump.match(/^CREATE TABLE /gm)?.length ?? 0;
      expect(tables).toBeGreaterThanOrEqual(40);
      // The statement that failed for seven nights must be in the output.
      expect(dump).toMatch(/SELECT pg_catalog\.setval\('public\.review_event_rejections_id_seq'/);
      expect(dump).toContain('COPY public.users');
    }, 180_000);
  });
});
