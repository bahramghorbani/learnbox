import { Pool } from 'pg';
import { readAdminDatabaseConfig } from '../../../../lib/server/admin-database';
import { getSharedAdminDatabasePool } from '../../../../lib/server/admin-database-pool';
import { loadAdminSession } from '../../../../lib/server/admin-route-security';
import { PostgresOwnerAuthStore } from '../../../../lib/server/postgres-owner-auth-store';
import { readAdminAuthConfig } from '../../../../lib/server/admin-auth-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getPool() {
  const dbConfig = readAdminDatabaseConfig(process.env);
  return getSharedAdminDatabasePool(dbConfig, (c: Record<string, unknown>) => new Pool(c));
}

async function requireSession(request: Request) {
  const config = readAdminAuthConfig(process.env);
  if (!config.enabled) return null;
  const pool = getPool();
  const store = new PostgresOwnerAuthStore(pool);
  return loadAdminSession(request, config, {
    findActiveSession: store.findActiveSession.bind(store),
    touchSession: store.touchSession.bind(store),
  });
}

type ParsedCard = {
  lemma: string;
  article: string | null;
  part_of_speech: string;
  cefr: string;
  meanings: string[];
  example_de: string | null;
  example_fa: string | null;
  row: number;
  errors: string[];
  duplicate: boolean;
};

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

const validPOS = ['noun', 'verb', 'adjective', 'adverb', 'phrase', 'other'];
const validArticles = ['der', 'die', 'das'];
const validCEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

// POST - parse and preview CSV, or confirm import
export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const contentType = request.headers.get('content-type') ?? '';

  // If JSON body = confirm import
  if (contentType.includes('application/json')) {
    return handleConfirmImport(request);
  }

  // Otherwise = CSV upload for preview
  const pool = getPool();
  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const packId = formData.get('pack_id') as string | null;

  if (!file || !packId) {
    return Response.json({ error: 'فایل CSV و شناسه بسته الزامی است' }, { status: 400 });
  }

  // Verify pack exists
  const packResult = await pool.query('SELECT * FROM packs WHERE id = $1', [packId]);
  if (packResult.rows.length === 0) {
    return Response.json({ error: 'بسته پیدا نشد' }, { status: 404 });
  }

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());

  if (lines.length < 2) {
    return Response.json({ error: 'فایل CSV باید حداقل یک ردیف داده داشته باشد' }, { status: 400 });
  }

  // Parse header
  const header = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const lemmaIdx = header.indexOf('lemma');
  const articleIdx = header.indexOf('article');
  const posIdx = header.indexOf('part_of_speech');
  const cefrIdx = header.indexOf('cefr');
  const meaningsIdx = header.indexOf('meanings');
  const exDeIdx = header.indexOf('example_de');
  const exFaIdx = header.indexOf('example_fa');

  if (lemmaIdx === -1 || meaningsIdx === -1) {
    return Response.json(
      {
        error: 'ستون‌های lemma و meanings الزامی هستند. ستون‌های موجود: ' + header.join(', '),
      },
      { status: 400 },
    );
  }

  // Get existing lemmas to check duplicates
  const existingLemmas = await pool.query('SELECT LOWER(lemma) as lemma FROM cards');
  const existingSet = new Set(existingLemmas.rows.map((r: { lemma: string }) => r.lemma));

  const cards: ParsedCard[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    const errors: string[] = [];

    const lemma = fields[lemmaIdx] ?? '';
    if (!lemma) {
      errors.push('lemma خالی است');
    }

    const article = articleIdx >= 0 ? fields[articleIdx] || null : null;
    if (article && !validArticles.includes(article.toLowerCase())) {
      errors.push('article باید der/die/das باشد');
    }

    const pos = posIdx >= 0 ? fields[posIdx] || 'other' : 'other';
    if (!validPOS.includes(pos.toLowerCase())) {
      errors.push('part_of_speech نامعتبر: ' + pos);
    }

    const cefr = cefrIdx >= 0 ? fields[cefrIdx] || 'A1' : 'A1';
    if (!validCEFR.includes(cefr.toUpperCase())) {
      errors.push('cefr نامعتبر: ' + cefr);
    }

    const meaningsRaw = fields[meaningsIdx] ?? '';
    const meanings = meaningsRaw
      .split('|')
      .map((m) => m.trim())
      .filter(Boolean);
    if (meanings.length === 0) {
      errors.push('حداقل یک معنی فارسی لازم است');
    }

    const exDe = exDeIdx >= 0 ? fields[exDeIdx] || null : null;
    const exFa = exFaIdx >= 0 ? fields[exFaIdx] || null : null;

    const duplicate = existingSet.has(lemma.toLowerCase());

    cards.push({
      lemma,
      article: article ? article.toLowerCase() : null,
      part_of_speech: pos.toLowerCase(),
      cefr: cefr.toUpperCase(),
      meanings,
      example_de: exDe,
      example_fa: exFa,
      row: i + 1,
      errors,
      duplicate,
    });
  }

  const valid = cards.filter((c) => c.errors.length === 0 && !c.duplicate);
  const withErrors = cards.filter((c) => c.errors.length > 0);
  const duplicates = cards.filter((c) => c.duplicate && c.errors.length === 0);

  return Response.json({
    preview: true,
    pack_id: packId,
    total: cards.length,
    valid: valid.length,
    duplicates: duplicates.length,
    errors: withErrors.length,
    cards,
  });
}

async function handleConfirmImport(request: Request) {
  const pool = getPool();
  const body = (await request.json()) as {
    pack_id: string;
    cards: ParsedCard[];
  };

  if (!body.pack_id || !body.cards?.length) {
    return Response.json({ error: 'داده‌های ورودی ناقص است' }, { status: 400 });
  }

  // Get current card count in pack
  const countResult = await pool.query(
    'SELECT count(*) as cnt FROM pack_cards WHERE pack_id = $1',
    [body.pack_id],
  );
  let sortOrder = Number(countResult.rows[0].cnt);

  const client = await pool.connect();
  const inserted: { id: string; lemma: string }[] = [];

  try {
    await client.query('BEGIN');

    for (const card of body.cards) {
      if (card.errors?.length > 0 || card.duplicate) continue;

      const cardId = crypto.randomUUID();
      const contentId = `${body.pack_id}_${card.lemma.toLowerCase().replace(/[^a-z0-9äöüß]/g, '_')}`;

      const examples = [];
      if (card.example_de) {
        examples.push({ german: card.example_de, persian: card.example_fa ?? '' });
      }

      await client.query(
        `INSERT INTO cards (id, lemma, content_version, created_at, content_id)
         VALUES ($1, $2, 1, now(), $3)`,
        [cardId, card.lemma, contentId],
      );

      await client.query(
        `INSERT INTO card_versions (id, card_id, version, status, content_json, source_provider, source_reference, confidence, created_at)
         VALUES ($1, $2, 1, 'needs_review', $3, 'editorial', 'csv_import', 1.0, now())`,
        [
          crypto.randomUUID(),
          cardId,
          JSON.stringify({
            lemma: card.lemma,
            article: card.article,
            partOfSpeech: card.part_of_speech,
            cefr: card.cefr,
            persianMeanings: card.meanings,
            examples,
            media: [],
          }),
        ],
      );

      sortOrder++;
      await client.query(
        'INSERT INTO pack_cards (pack_id, card_id, sort_order) VALUES ($1, $2, $3)',
        [body.pack_id, cardId, sortOrder],
      );

      inserted.push({ id: cardId, lemma: card.lemma });
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[csv-import] failed:', err);
    return Response.json({ error: 'خطا در ذخیره‌سازی' }, { status: 500 });
  } finally {
    client.release();
  }

  return Response.json({
    imported: inserted.length,
    cards: inserted,
  });
}
