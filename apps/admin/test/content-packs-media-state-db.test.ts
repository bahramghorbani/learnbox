import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PostgresContentPacksStore } from '../lib/server/postgres-content-packs-store';

const url = process.env.TEST_DATABASE_URL;
if (!url && process.env.CI) throw new Error('TEST_DATABASE_URL is required in CI');
const suite = url ? describe : describe.skip;

const ACTOR = '55555555-5555-4555-8555-555555555555';
const CARD_WITH_MEDIA = '11111111-1111-4111-8111-111111111111';
const CARD_WITHOUT_MEDIA = '22222222-2222-4222-8222-222222222222';
const VERSION_A = '33333333-3333-4333-8333-333333333333';
const VERSION_B = '44444444-4444-4444-8444-444444444444';

let root: Pool;
let pool: Pool;
let database = '';

suite('content packs media state against real Postgres', () => {
  beforeAll(async () => {
    root = new Pool({ connectionString: url, max: 1 });
    root.on('error', () => undefined);
    database = `content_packs_media_${randomBytes(4).toString('hex')}`;
    await root.query(`CREATE DATABASE ${database}`);
    const scoped = new URL(url as string);
    scoped.pathname = `/${database}`;
    pool = new Pool({ connectionString: scoped.toString(), max: 2 });
    pool.on('error', () => undefined);

    const dir = join(__dirname, '../../../database/migrations');
    for (const f of readdirSync(dir).filter((x) => /^\d{4}_.+\.sql$/.test(x)).sort()) {
      await pool.query(readFileSync(join(dir, f), 'utf8'));
    }

    await pool.query(`INSERT INTO users (id, phone_e164, first_name) VALUES ($1,'+491****0088','reviewer')`, [
      ACTOR,
    ]);
    await pool.query(`INSERT INTO admin_role_assignments (user_id, role) VALUES ($1, 'content_reviewer')`, [
      ACTOR,
    ]);
    await pool.query(
      `INSERT INTO packs (id, display_name, target_item_count, category, is_free, status)
       VALUES ('media-fixture', 'Fixture', 2, 'essentials', true, 'needs_review')`,
    );
    for (const [cardId, lemma, sort] of [
      [CARD_WITH_MEDIA, 'Haus', 1],
      [CARD_WITHOUT_MEDIA, 'Garten', 2],
    ] as const) {
      await pool.query(`INSERT INTO cards (id, content_id, lemma) VALUES ($1, $2, $3)`, [
        cardId,
        `fixture-${lemma}`,
        lemma,
      ]);
      await pool.query(`INSERT INTO pack_cards (pack_id, card_id, sort_order) VALUES ('media-fixture', $1, $2)`, [
        cardId,
        sort,
      ]);
    }
    await pool.query(
      `INSERT INTO card_versions (id, card_id, version, status, source_provider, content_json)
       VALUES ($1, $2, 1, 'needs_review', 'editorial', '{"persianMeanings":["خانه"]}'::jsonb)`,
      [VERSION_A, CARD_WITH_MEDIA],
    );
    await pool.query(
      `INSERT INTO card_versions (id, card_id, version, status, source_provider, content_json)
       VALUES ($1, $2, 1, 'needs_review', 'editorial', '{"persianMeanings":["باغ"]}'::jsonb)`,
      [VERSION_B, CARD_WITHOUT_MEDIA],
    );

    // Accepted media only for CARD_WITH_MEDIA, all three kinds.
    const fixtures = [
      {
        kind: 'image',
        capability: 'image',
        objectKey: `admin/card-media/media-fixture/image/${VERSION_A}.png`,
        mediaType: 'image/png',
        extra: `image_standard_version`,
        extraValue: 'v1',
      },
      {
        kind: 'word_audio',
        capability: 'audio',
        objectKey: `admin/card-media/media-fixture/word_audio/${VERSION_A}.mp3`,
        mediaType: 'audio/mpeg',
      },
      {
        kind: 'sentence_audio',
        capability: 'audio',
        objectKey: `admin/card-media/media-fixture/sentence_audio/${VERSION_A}.mp3`,
        mediaType: 'audio/mpeg',
      },
    ] as const;
    for (const f of fixtures) {
      const isAudio = f.capability === 'audio';
      const candidateResult = await pool.query(
        `INSERT INTO card_media_candidates
           (card_id, kind, status, provider, model, capability, object_key, checksum, byte_size,
            media_type, spoken_target, voice, voice_role, language, locale, image_standard_version)
         VALUES ($1, $2, 'accepted', 'manual', 'manual', $3, $4,
                 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 1024, $5,
                 ${isAudio ? "'Haus'" : 'NULL'}, ${isAudio ? "'de-DE-A'" : 'NULL'},
                 ${isAudio ? "'der_masculine'" : 'NULL'}, ${isAudio ? "'de'" : 'NULL'},
                 ${isAudio ? "'de-DE'" : 'NULL'}, ${isAudio ? 'NULL' : "'v1'"})
         RETURNING id`,
        [CARD_WITH_MEDIA, f.kind, f.capability, f.objectKey, f.mediaType],
      );
      await pool.query(`INSERT INTO card_media_assets (card_id, kind, candidate_id) VALUES ($1, $2, $3)`, [
        CARD_WITH_MEDIA,
        f.kind,
        candidateResult.rows[0].id,
      ]);
    }
  });

  afterAll(async () => {
    await pool?.end();
    await root?.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    await root?.end();
  });

  it('reports real accepted-asset counts, never «unrecorded», for both the media card and the bare one', async () => {
    const store = new PostgresContentPacksStore(pool);
    const result = await store.listPackCards(ACTOR, 'media-fixture');
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    const withMedia = result.cards.find((c) => c.cardId === CARD_WITH_MEDIA);
    const withoutMedia = result.cards.find((c) => c.cardId === CARD_WITHOUT_MEDIA);

    expect(withMedia?.media).toEqual({
      imageCount: 1,
      wordAudioCount: 1,
      sentenceAudioCount: 1,
      unrecorded: false,
    });
    // Real zero, not «unrecorded»: this card genuinely has no accepted media yet.
    expect(withoutMedia?.media).toEqual({
      imageCount: 0,
      wordAudioCount: 0,
      sentenceAudioCount: 0,
      unrecorded: false,
    });
  });
});
