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

// POST - generate cards for a pack using Claude AI
export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const pool = getPool();
  try {
    const body = await request.json() as {
      pack_id: string;
      prompt?: string;
    };

    // Get pack info
    const packResult = await pool.query('SELECT * FROM packs WHERE id = $1', [body.pack_id]);
    if (packResult.rows.length === 0) {
      return Response.json({ error: 'pack_not_found' }, { status: 404 });
    }
    const pack = packResult.rows[0];

    // Check existing card count
    const existingCount = await pool.query(
      'SELECT count(*) as cnt FROM pack_cards WHERE pack_id = $1',
      [body.pack_id],
    );
    const currentCards = Number(existingCount.rows[0].cnt);
    const needed = pack.target_item_count - currentCards;

    if (needed <= 0) {
      return Response.json({ error: 'pack_full', message: 'بسته قبلاً کامل شده' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json({
        error: 'api_key_missing',
        message: 'کلید API هوش مصنوعی تنظیم نشده. ANTHROPIC_API_KEY را در Vercel اضافه کنید.',
      }, { status: 503 });
    }

    const systemPrompt = `You are a German language expert creating vocabulary cards for Persian-speaking learners.
Generate exactly ${needed} German vocabulary items for a "${pack.display_name}" pack at CEFR level ${pack.target_cefr}.
${pack.category ? `Category/theme: ${pack.category}` : ''}
${body.prompt || pack.ai_prompt ? `Additional instructions: ${body.prompt || pack.ai_prompt}` : ''}

For each word, provide a JSON object with these fields:
- lemma: the German word (with article for nouns, e.g. "der Koffer")
- article: "der", "die", or "das" (only for nouns, null otherwise)
- part_of_speech: "noun", "verb", "adjective", "adverb", "phrase", or "other"
- cefr: "${pack.target_cefr}"
- persian_meanings: array of 1-3 Persian meanings
- examples: array of 1-2 objects with {german, persian} sentence pairs
- content_id: a unique slug like "koffer" or "reisen"

Respond ONLY with a valid JSON array. No markdown, no explanation.
Avoid duplicate lemmas. Make sure examples are natural and useful for ${pack.target_cefr} learners.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        messages: [{ role: 'user', content: systemPrompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[ai-generate] Claude API error:', response.status, errText);
      return Response.json({ error: 'ai_error', message: 'خطا در ارتباط با هوش مصنوعی' }, { status: 502 });
    }

    const aiResult = await response.json() as {
      content: { type: string; text: string }[];
    };
    const textContent = aiResult.content.find((c: { type: string }) => c.type === 'text');
    if (!textContent) {
      return Response.json({ error: 'ai_empty', message: 'پاسخ هوش مصنوعی خالی بود' }, { status: 502 });
    }

    let generatedCards: {
      lemma: string;
      article?: string;
      part_of_speech: string;
      cefr: string;
      persian_meanings: string[];
      examples: { german: string; persian: string }[];
      content_id: string;
    }[];

    try {
      generatedCards = JSON.parse(textContent.text);
    } catch {
      // Try extracting JSON from markdown code block
      const jsonMatch = textContent.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        generatedCards = JSON.parse(jsonMatch[0]);
      } else {
        return Response.json({ error: 'ai_parse_error', message: 'پاسخ هوش مصنوعی قابل پردازش نبود' }, { status: 502 });
      }
    }

    // Store generated cards in DB
    const insertedCards = [];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < generatedCards.length; i++) {
        const card = generatedCards[i];
        const cardId = crypto.randomUUID();
        const contentId = `${body.pack_id}_${card.content_id}`;

        // Insert card
        await client.query(
          `INSERT INTO cards (id, lemma, content_version, created_at, content_id)
           VALUES ($1, $2, 1, now(), $3)`,
          [cardId, card.lemma, contentId],
        );

        // Insert card version with full content
        await client.query(
          `INSERT INTO card_versions (id, card_id, version, status, content_json, source_provider, source_reference, confidence, created_at)
           VALUES ($1, $2, 1, 'ai_generated', $3, 'ai_suggestion', 'claude-sonnet-4', 0.85, now())`,
          [
            crypto.randomUUID(),
            cardId,
            JSON.stringify({
              lemma: card.lemma,
              article: card.article ?? null,
              partOfSpeech: card.part_of_speech,
              cefr: card.cefr,
              persianMeanings: card.persian_meanings,
              examples: card.examples,
              media: [],
            }),
          ],
        );

        // Link to pack
        await client.query(
          'INSERT INTO pack_cards (pack_id, card_id, sort_order) VALUES ($1, $2, $3)',
          [body.pack_id, cardId, currentCards + i + 1],
        );

        insertedCards.push({
          id: cardId,
          lemma: card.lemma,
          content_id: contentId,
          persian_meanings: card.persian_meanings,
        });
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Update pack status
    await pool.query(
      "UPDATE packs SET status = 'ai_generated' WHERE id = $1 AND status = 'draft'",
      [body.pack_id],
    );

    return Response.json({
      generated: insertedCards.length,
      total: currentCards + insertedCards.length,
      target: pack.target_item_count,
      cards: insertedCards,
    });
  } catch (error) {
    console.error('[ai-generate] failed:', error);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}
