import { Pool } from 'pg';
import { authenticateLearner } from '../../../../lib/learner-auth';
import { requireVerifiedDatabaseTls } from '../../../../../api/dist/database/migration-runner.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  return new Pool({ connectionString: requireVerifiedDatabaseTls(url), max: 1 });
}

interface ContentJson {
  lemma?: string;
  article?: string;
  persianMeanings?: string[];
  cefr?: string;
}

/**
 * GET /api/learner/words
 * Returns all words from published packs with Leitner box status.
 * Query params: ?pack=<pack_id> to filter by pack
 */
export async function GET(request: Request): Promise<Response> {
  const session = await authenticateLearner(request);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: privateHeaders });
  }

  const url = new URL(request.url);
  const packFilter = url.searchParams.get('pack');

  const pool = getPool();
  try {
    // Get all packs that have published cards
    const packsResult = await pool.query(
      `SELECT DISTINCT p.id as pack_id, p.display_name as pack_title
       FROM packs p
       JOIN pack_cards pc ON pc.pack_id = p.id
       JOIN card_versions cv ON cv.card_id = pc.card_id AND cv.status = 'published'
       ORDER BY p.display_name`,
    );

    const packIds = packsResult.rows.map((r: { pack_id: string }) => r.pack_id);
    if (packIds.length === 0) {
      return Response.json(
        { packs: [], words: [], summary: { total: 0, mastered: 0, learning: 0, new: 0 } },
        { headers: privateHeaders },
      );
    }

    let packClause = '';
    const params: (string | string[])[] = [session.subject];
    if (packFilter && packIds.includes(packFilter)) {
      packClause = 'AND pc.pack_id = $2';
      params.push(packFilter);
    } else {
      packClause = 'AND pc.pack_id = ANY($2)';
      params.push(packIds);
    }

    // content_json is a JSONB column with lemma, article, persianMeanings, cefr
    const wordsResult = await pool.query(
      `SELECT
         cv.card_id,
         cv.content_json,
         pc.pack_id,
         p.display_name as pack_title,
         cs.state,
         cs.stability_days,
         cs.lapses,
         cs.due_at,
         cs.last_reviewed_at,
         (SELECT COUNT(*) FROM review_events re WHERE re.card_id = cv.card_id AND re.user_id = $1) as review_count,
         (SELECT COUNT(*) FROM review_events re WHERE re.card_id = cv.card_id AND re.user_id = $1 AND re.grade = 'forgot') as forgot_count
       FROM card_versions cv
       JOIN pack_cards pc ON pc.card_id = cv.card_id
       JOIN packs p ON p.id = pc.pack_id
       LEFT JOIN card_schedules cs ON cs.card_id = cv.card_id AND cs.user_id = $1
       WHERE cv.status = 'published' ${packClause}
       ORDER BY COALESCE(cs.stability_days, 0) ASC`,
      params,
    );

    const boxLabels = ['جدید', 'آشنایی', 'تمرین', 'تثبیت', 'مرور', 'مسلط'];
    const boxColors = ['#6b7280', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'];

    const words = wordsResult.rows.map(
      (row: {
        card_id: string;
        content_json: ContentJson;
        pack_id: string;
        pack_title: string;
        state: string | null;
        stability_days: number | null;
        lapses: number | null;
        due_at: string | null;
        last_reviewed_at: string | null;
        review_count: string;
        forgot_count: string;
      }) => {
        const c = row.content_json ?? {};
        const lemma = c.lemma ?? '';
        const article = c.article ?? '';
        const german = article ? `${article} ${lemma}` : lemma;
        const persian = (c.persianMeanings ?? [])[0] ?? '';
        const cefrLevel = c.cefr ?? null;

        const stabilityDays = row.stability_days ?? 0;
        let box = 0;
        if (row.state) {
          if (stabilityDays < 1) box = 1;
          else if (stabilityDays < 3) box = 2;
          else if (stabilityDays < 7) box = 3;
          else if (stabilityDays < 21) box = 4;
          else box = 5;
        }

        return {
          cardId: row.card_id,
          german,
          persian,
          cefrLevel,
          packId: row.pack_id,
          packTitle: row.pack_title,
          box,
          boxLabel: boxLabels[box],
          boxColor: boxColors[box],
          state: row.state ?? 'new',
          stabilityDays,
          reviewCount: parseInt(row.review_count, 10),
          forgotCount: parseInt(row.forgot_count, 10),
          dueAt: row.due_at,
          lastReviewedAt: row.last_reviewed_at,
        };
      },
    );

    const summary = {
      total: words.length,
      mastered: words.filter((w: { box: number }) => w.box >= 4).length,
      learning: words.filter((w: { box: number }) => w.box >= 1 && w.box <= 3).length,
      new: words.filter((w: { box: number }) => w.box === 0).length,
    };

    return Response.json(
      {
        packs: packsResult.rows.map((r: { pack_id: string; pack_title: string }) => ({
          id: r.pack_id,
          title: r.pack_title,
        })),
        words,
        summary,
      },
      { headers: privateHeaders },
    );
  } catch (err) {
    console.error('[words] API error:', err);
    return Response.json({ error: 'internal_error' }, { status: 500, headers: privateHeaders });
  } finally {
    await pool.end();
  }
}
