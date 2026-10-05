export type ContentPackStatus =
  'draft' | 'ai_generated' | 'needs_review' | 'approved' | 'published';

/**
 * Per-card media availability derived from the canonical `content_json.media[]` payload. The
 * canonical schema carries no denormalized image/audio columns, so this is computed server-side
 * from the same array the content-review store reads. `unknown` is reported honestly when a
 * version carries no media entries at all: it means "not recorded yet", never "absent".
 */
export interface ContentPackCardMediaState {
  imageCount: number;
  wordAudioCount: number;
  sentenceAudioCount: number;
  /** True only when `media[]` is empty, i.e. the canonical model holds no media facts yet. */
  unrecorded: boolean;
}

export interface ContentPackCardEntry {
  cardId: string;
  cardVersionId: string;
  contentId: string;
  lemma: string;
  versionStatus: string;
  sortOrder: number;
  article: string | null;
  partOfSpeech: string;
  persianMeanings: string[];
  essentialInflection: string | null;
  pronunciationIpa: string | null;
  examples: Array<{ german: string; persian: string }>;
  /**
   * Remaining editable canonical fields (Phase 1 / M1.2). The management form must prefill the
   * WHOLE editable surface: a form that only knew the display subset above would save blanks over
   * stored `content_json` values on every edit.
   */
  simpleGermanDefinition: string;
  grammarNote: string;
  topicTags: string[];
  difficulty: number;
  cefr: string;
  visualConcept: string;
  imagePrompt: string;
  sourceReference: string;
  media: ContentPackCardMediaState;
}

export interface ContentPackEntry {
  id: string;
  displayName: string;
  description: string | null;
  locale: string;
  targetCefr: string;
  targetItemCount: number;
  category: string | null;
  isFree: boolean;
  priceTomans: number | null;
  status: ContentPackStatus;
  createdAt: string | null;
  publishedAt: string | null;
  cardCount: number;
  publishedCardCount: number;
  reviewableCardCount: number;
}

export type ContentPacksListResult =
  { status: 'forbidden' } | { status: 'ok'; packs: ContentPackEntry[] };

export type ContentPackCardsResult =
  | { status: 'forbidden' }
  | { status: 'not_found' }
  | { status: 'ok'; pack: ContentPackEntry; cards: ContentPackCardEntry[] };

type QueryResult = { rows: Record<string, unknown>[] };
type Queryable = {
  query(sql: string, parameters?: readonly unknown[]): Promise<QueryResult>;
};
type Client = Queryable & { release(): void };
type DatabasePool = Queryable & { connect(): Promise<Client> };

const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const packIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;

const packStatuses: readonly ContentPackStatus[] = [
  'draft',
  'ai_generated',
  'needs_review',
  'approved',
  'published',
];

function toIsoString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function normalizeStatus(value: unknown): ContentPackStatus {
  const raw = String(value ?? 'draft');
  return (packStatuses as readonly string[]).includes(raw) ? (raw as ContentPackStatus) : 'draft';
}

function toCount(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Derives image/word-audio/sentence-audio availability from the canonical media array. Entries are
 * classified by their `kind` discriminator; anything unrecognized is ignored rather than guessed.
 */
export function deriveCardMediaState(media: unknown): ContentPackCardMediaState {
  const entries = Array.isArray(media) ? media : [];
  let imageCount = 0;
  let wordAudioCount = 0;
  let sentenceAudioCount = 0;

  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object') continue;
    const kind = String((entry as Record<string, unknown>).kind ?? '').toLowerCase();
    if (kind === 'image' || kind === 'illustration') imageCount += 1;
    else if (kind === 'word_audio' || kind === 'audio_word') wordAudioCount += 1;
    else if (kind === 'sentence_audio' || kind === 'audio_sentence') sentenceAudioCount += 1;
  }

  return {
    imageCount,
    wordAudioCount,
    sentenceAudioCount,
    unrecorded: entries.length === 0,
  };
}

function mapPackRow(row: Record<string, unknown>): ContentPackEntry {
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    description:
      row.description === null || row.description === undefined ? null : String(row.description),
    locale: String(row.locale ?? 'de-DE'),
    targetCefr: String(row.target_cefr ?? 'A1'),
    targetItemCount: toCount(row.target_item_count),
    category: row.category === null || row.category === undefined ? null : String(row.category),
    isFree: row.is_free === true,
    priceTomans:
      row.price_tomans === null || row.price_tomans === undefined
        ? null
        : toCount(row.price_tomans),
    status: normalizeStatus(row.status),
    createdAt: toIsoString(row.created_at),
    publishedAt: toIsoString(row.published_at),
    cardCount: toCount(row.card_count),
    publishedCardCount: toCount(row.published_card_count),
    reviewableCardCount: toCount(row.reviewable_card_count),
  };
}

const packSelect = `
  SELECT p.id,
         p.display_name,
         p.description,
         p.locale,
         p.target_cefr,
         p.target_item_count,
         p.category,
         p.is_free,
         p.price_tomans,
         p.status,
         p.created_at,
         p.published_at,
         (SELECT count(*) FROM pack_cards pc WHERE pc.pack_id = p.id) AS card_count,
         (SELECT count(DISTINCT pc.card_id)
            FROM pack_cards pc
            JOIN card_versions cv ON cv.card_id = pc.card_id
           WHERE pc.pack_id = p.id AND cv.status = 'published') AS published_card_count,
         (SELECT count(DISTINCT pc.card_id)
            FROM pack_cards pc
            JOIN card_versions cv ON cv.card_id = pc.card_id
           WHERE pc.pack_id = p.id
             AND cv.status IN ('auto_validated', 'needs_review')) AS reviewable_card_count
    FROM packs p`;

/**
 * Server-only read layer for the Admin Content & Packs workspace (Phase 1, Milestone 1.1). It
 * reuses the canonical `packs` / `pack_cards` / `cards` / `card_versions` relationships and the
 * same PostgreSQL-resolved role gate as the content-review store: the actor always comes from a
 * validated Passkey session and roles are never read from a browser request. This class is
 * deliberately read-only — it exposes no create, publish or mutate operation, and it adds no
 * Admin-specific business data of its own.
 */
export class PostgresContentPacksStore {
  constructor(private readonly pool: DatabasePool) {}

  private async roleQuery(client: Queryable, actorUserId: string): Promise<boolean> {
    const roles = await client.query(
      `SELECT role
         FROM admin_role_assignments
        WHERE user_id = $1 AND role IN ('content_reviewer', 'super_admin')`,
      [actorUserId],
    );
    return roles.rows.length > 0;
  }

  async listPacks(actorUserId: string): Promise<ContentPacksListResult> {
    if (!canonicalUuidPattern.test(actorUserId)) throw new Error('Actor user id is invalid.');
    const client = await this.pool.connect();
    try {
      if (!(await this.roleQuery(client, actorUserId))) return { status: 'forbidden' };
      const result = await client.query(`${packSelect} ORDER BY p.created_at DESC, p.id`);
      return { status: 'ok', packs: result.rows.map(mapPackRow) };
    } finally {
      client.release();
    }
  }

  async listPackCards(actorUserId: string, packId: string): Promise<ContentPackCardsResult> {
    if (!canonicalUuidPattern.test(actorUserId)) throw new Error('Actor user id is invalid.');
    if (!packIdPattern.test(packId)) return { status: 'not_found' };
    const client = await this.pool.connect();
    try {
      if (!(await this.roleQuery(client, actorUserId))) return { status: 'forbidden' };

      const packResult = await client.query(`${packSelect} WHERE p.id = $1`, [packId]);
      if (packResult.rows.length === 0) return { status: 'not_found' };
      const pack = mapPackRow(packResult.rows[0]);

      // Latest version per card, so a card is represented once even when revisions exist.
      const cardResult = await client.query(
        `SELECT pc.card_id,
                pc.sort_order,
                c.content_id,
                c.lemma,
                cv.id AS card_version_id,
                cv.status,
                cv.source_reference,
                cv.content_json
           FROM pack_cards pc
           JOIN cards c ON c.id = pc.card_id
           JOIN LATERAL (
                  SELECT inner_cv.id, inner_cv.status, inner_cv.source_reference,
                         inner_cv.content_json
                    FROM card_versions inner_cv
                   WHERE inner_cv.card_id = pc.card_id
                   ORDER BY inner_cv.version DESC
                   LIMIT 1
                ) cv ON true
          WHERE pc.pack_id = $1
          ORDER BY pc.sort_order, c.content_id`,
        [packId],
      );

      const cards = cardResult.rows.map((row) => {
        const content = (row.content_json ?? {}) as Record<string, unknown>;
        const pronunciation = content.pronunciation as Record<string, unknown> | undefined;
        const examples = Array.isArray(content.examples)
          ? (content.examples as Array<{ german?: unknown; persian?: unknown }>).map((example) => ({
              german: String(example.german ?? ''),
              persian: String(example.persian ?? ''),
            }))
          : [];
        const persianMeanings = Array.isArray(content.persianMeanings)
          ? (content.persianMeanings as unknown[]).map(String)
          : [];

        return {
          cardId: String(row.card_id),
          cardVersionId: String(row.card_version_id),
          contentId: String(row.content_id),
          lemma: String(row.lemma),
          versionStatus: String(row.status),
          sortOrder: toCount(row.sort_order),
          article:
            content.article === null || content.article === undefined
              ? null
              : String(content.article),
          partOfSpeech: String(content.partOfSpeech ?? 'other'),
          persianMeanings,
          essentialInflection:
            content.essentialInflection === null || content.essentialInflection === undefined
              ? null
              : String(content.essentialInflection),
          pronunciationIpa:
            pronunciation && pronunciation.ipa !== null && pronunciation.ipa !== undefined
              ? String(pronunciation.ipa)
              : null,
          examples,
          simpleGermanDefinition: String(content.simpleGermanDefinition ?? ''),
          grammarNote: String(content.grammarNote ?? ''),
          topicTags: Array.isArray(content.topicTags)
            ? (content.topicTags as unknown[]).map(String)
            : [],
          difficulty: toCount(content.difficulty) || 1,
          cefr: String(content.cefr ?? ''),
          visualConcept: String(content.visualConcept ?? ''),
          imagePrompt: String(content.imagePrompt ?? ''),
          sourceReference: String(row.source_reference ?? ''),
          media: deriveCardMediaState(content.media),
        } satisfies ContentPackCardEntry;
      });

      return { status: 'ok', pack, cards };
    } finally {
      client.release();
    }
  }
}
