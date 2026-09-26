import { Pool } from 'pg';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const url = process.env.DATABASE_URL;
  if (!url) return Response.json({ error: 'no_db' });
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const packs = await pool.query(
      `SELECT DISTINCT p.id, p.display_name FROM packs p
       JOIN pack_cards pc ON pc.pack_id = p.id
       JOIN card_versions cv ON cv.card_id = pc.card_id WHERE cv.status = 'published'`
    );
    const packIds = packs.rows.map((r: { id: string }) => r.id);
    const words = await pool.query(
      `SELECT cv.card_id, cv.content_json
       FROM card_versions cv
       JOIN pack_cards pc ON pc.card_id = cv.card_id
       WHERE cv.status = 'published' AND pc.pack_id = ANY($1)
       LIMIT 3`,
      [packIds]
    );
    const samples = words.rows.map((r: { card_id: string; content_json: { lemma?: string; persianMeanings?: string[] } }) => ({
      id: r.card_id,
      lemma: r.content_json?.lemma,
      persian: r.content_json?.persianMeanings?.[0],
    }));
    return Response.json({ packCount: packs.rows.length, wordCount: words.rows.length, samples });
  } catch (err) {
    return Response.json({ error: String(err) });
  } finally {
    await pool.end();
  }
}
