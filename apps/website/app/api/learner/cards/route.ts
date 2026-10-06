import { Pool } from 'pg';
import { authenticateLearner } from '../../../../lib/learner-auth';
import { packAccessSql } from '../../../../lib/pack-access';
import { requireVerifiedDatabaseTls } from '../../../../../api/dist/database/migration-runner.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
const posMap: Record<string, string> = {
  noun: 'اسم',
  verb: 'فعل',
  adjective: 'صفت',
  adverb: 'قید',
  interjection: 'حرف ندا',
  phrase: 'عبارت',
};

type Content = {
  id?: string;
  article?: string;
  lemma?: string;
  simpleGermanDefinition?: string;
  persianMeanings?: string[];
  examples?: Array<{ german?: string; persian?: string }>;
  pronunciation?: { ipa?: string };
  cefr?: string;
  partOfSpeech?: string;
  grammarNote?: string;
  essentialInflection?: string;
  topicTags?: string[];
};

/** Authenticated, published DB faces only; draft JSON is never bundled into client JS. */
export async function GET(request: Request): Promise<Response> {
  const session = await authenticateLearner(request);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401, headers });
  if (process.env.WEB_LEARNER_STATE_ENABLED !== 'true' || !process.env.DATABASE_URL)
    return Response.json({ error: 'unavailable' }, { status: 503, headers });
  const pool = new Pool({
    connectionString: requireVerifiedDatabaseTls(process.env.DATABASE_URL),
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  try {
    const result = await pool.query<{ content_id: string; content_json: Content }>(
      `SELECT cv.content_json->>'id' AS content_id, cv.content_json
         FROM cards c
         JOIN pack_cards pc ON pc.card_id = c.id
         JOIN packs p ON p.id = pc.pack_id
         JOIN LATERAL (
           SELECT content_json FROM card_versions
           WHERE card_id = c.id AND status = 'published'
           ORDER BY version DESC LIMIT 1
         ) cv ON true
        WHERE ${packAccessSql('p', '$1')}
        ORDER BY content_id`,
      [session.subject],
    );
    const items = result.rows.flatMap(({ content_id, content_json: c }) => {
      if (
        !/^start-a1-[a-z0-9-]+$/.test(content_id ?? '') ||
        !c ||
        !c.lemma ||
        !c.persianMeanings?.[0] ||
        !c.examples?.[0]?.german
      )
        return [];
      return [
        {
          id: content_id,
          article: c.article ?? '',
          german: c.lemma,
          germanDefinition: c.simpleGermanDefinition ?? '',
          persian: c.persianMeanings[0],
          exampleGerman: c.examples[0].german,
          examplePersian: c.examples[0].persian ?? '',
          ipa: c.pronunciation?.ipa ?? '',
          cefr: c.cefr ?? '',
          partOfSpeech: posMap[c.partOfSpeech ?? ''] ?? '',
          grammarNote: c.grammarNote ?? '',
          inflection: c.essentialInflection ?? '',
          topicTags: c.topicTags ?? [],
        },
      ];
    });
    return Response.json({ items }, { headers });
  } catch {
    return Response.json({ error: 'unavailable' }, { status: 503, headers });
  } finally {
    await pool.end();
  }
}
