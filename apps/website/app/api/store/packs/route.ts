import { Pool } from 'pg';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  return new Pool({ connectionString: url, max: 4, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000 });
}

// GET /api/store/packs — public list of published packs
// GET /api/store/packs?id=xxx — pack detail with sample cards
export async function GET(request: NextRequest) {
  const pool = getPool();
  const packId = request.nextUrl.searchParams.get('id');

  try {
    if (packId) {
      // Single pack detail with sample cards
      const pack = await pool.query(
        `SELECT id, display_name, description, locale, target_cefr, target_item_count,
                category, is_free, price_tomans, status
           FROM packs WHERE id = $1 AND status = 'published'`,
        [packId],
      );
      if (pack.rows.length === 0) {
        return Response.json({ error: 'not_found' }, { status: 404 });
      }
      // Get sample cards (first 5, only lemma - no meanings until purchased)
      const samples = await pool.query(
        `SELECT cv.lemma, cv.article, cv.part_of_speech, cv.cefr_level
           FROM pack_cards pc
           JOIN card_versions cv ON cv.card_id = pc.card_id AND cv.publication_status = 'published'
          WHERE pc.pack_id = $1
          ORDER BY pc.sort_order
          LIMIT 5`,
        [packId],
      );
      // Total card count
      const total = await pool.query(
        'SELECT count(*) as cnt FROM pack_cards WHERE pack_id = $1',
        [packId],
      );
      return Response.json({
        pack: pack.rows[0],
        sampleCards: samples.rows,
        totalCards: parseInt(String(total.rows[0].cnt), 10),
      });
    }

    // List all published packs
    const category = request.nextUrl.searchParams.get('category');
    const sort = request.nextUrl.searchParams.get('sort') || 'newest';

    let query = `
      SELECT p.id, p.display_name, p.description, p.target_cefr, p.target_item_count,
             p.category, p.is_free, p.price_tomans, p.status, p.published_at,
             (SELECT count(*) FROM pack_cards WHERE pack_id = p.id) as card_count
        FROM packs p
       WHERE p.status = 'published'
    `;
    const params: string[] = [];
    if (category) {
      params.push(category);
      query += ` AND p.category = $${params.length}`;
    }

    if (sort === 'cheapest') query += ' ORDER BY COALESCE(p.price_tomans, 0) ASC';
    else query += ' ORDER BY p.published_at DESC NULLS LAST';

    const result = await pool.query(query, params);
    return Response.json({ packs: result.rows });
  } catch (err) {
    console.error('[store/packs]', err instanceof Error ? err.message : err);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}
