import { createHash } from 'node:crypto';

import {
  type CefrLevel,
  type ContentStatus,
  type LearningVocabularyItem,
  type PartOfSpeech,
  type VersionedMediaAsset,
  validateLearningVocabularyItem,
} from '@learnbox/content-models';

/**
 * Phase 1 / Milestone 1.2 — Pack & Card management writes.
 *
 * This is the write counterpart to `postgres-content-packs-store.ts`. It deliberately shares that
 * module's contract and constraints:
 *
 *  - It writes ONLY canonical tables: `packs`, `pack_cards`, `cards`, `card_versions`. There is no
 *    Admin-owned mirror of content and no denormalized Admin column.
 *  - `content_json` is persisted as a canonical `LearningVocabularyItem` and validated with the
 *    canonical `validateLearningVocabularyItem()`. The Admin does not define its own content rules.
 *  - Roles are resolved inside the transaction from `admin_role_assignments`, never from the
 *    request. The actor always arrives from an already-validated Passkey session.
 *  - Every write records an `audit_logs` row, exactly like the content-review store.
 *
 * REVIEW / PUBLICATION INTEGRITY (the load-bearing invariant of this milestone):
 * this module never writes `status = 'published'`, never writes `published_at`, and never advances
 * a card version into a review-complete state. Cards are created at `status = 'draft'`; editing a
 * draft updates that draft in place, and editing a card whose current version has already left
 * `draft` creates a NEW `draft` version instead of mutating reviewed content. Publication stays
 * behind the existing canonical gates (the content-review decision flow and
 * `evaluateContentPackReleaseReadiness`), which are out of scope here.
 *
 * Because the learner read model requires BOTH `packs.status = 'published'` AND
 * `card_versions.status = 'published'` (see `apps/website/lib/learner-read-model.ts`), content
 * created through this module is invisible to learners until those canonical gates run.
 */

export type ContentPackWriteStatus = 'draft' | 'needs_review' | 'approved' | 'archived';

export interface PackUpsertInput {
  /** Canonical pack id. Required on create; immutable afterwards. */
  packId: string;
  displayName: string;
  description?: string;
  locale?: string;
  targetCefr?: string;
  targetItemCount?: number;
  category?: string;
  isFree?: boolean;
  idempotencyKey: string;
}

export interface PackEditInput {
  packId: string;
  displayName?: string;
  description?: string;
  targetCefr?: string;
  category?: string;
  targetItemCount?: number;
  isFree?: boolean;
  idempotencyKey: string;
}

export interface CardCreateInput {
  packId: string;
  /** Canonical educational payload, shaped exactly like the stored `content_json`. */
  content: CardContentInput;
  sortOrder?: number;
  idempotencyKey: string;
}

export interface CardEditInput {
  cardId: string;
  content: CardContentInput;
  idempotencyKey: string;
}

/** The editable educational surface. Mirrors `LearningVocabularyItem` minus derived/gated fields. */
export interface CardContentInput {
  lemma: string;
  article?: string;
  partOfSpeech?: string;
  essentialInflection?: string;
  pronunciationIpa?: string;
  persianMeanings: string[];
  examples: Array<{ german: string; persian: string }>;
  simpleGermanDefinition: string;
  grammarNote: string;
  topicTags: string[];
  difficulty: number;
  cefr?: string;
  visualConcept: string;
  imagePrompt: string;
  sourceReference: string;
}

export type PackWriteResult =
  | { status: 'forbidden' }
  | { status: 'conflict'; reason: string }
  | { status: 'not_found' }
  | { status: 'invalid'; issues: Array<{ field: string; message: string }> }
  | { status: 'idempotent'; packId: string }
  | { status: 'applied'; packId: string };

export type CardWriteResult =
  | { status: 'forbidden' }
  | { status: 'conflict'; reason: string }
  | { status: 'not_found' }
  | { status: 'invalid'; issues: Array<{ field: string; message: string }> }
  | { status: 'idempotent'; cardId: string; cardVersionId: string }
  | { status: 'applied'; cardId: string; cardVersionId: string; version: number };

type QueryResult = { rows: Record<string, unknown>[] };
type Queryable = {
  query(sql: string, parameters?: readonly unknown[]): Promise<QueryResult>;
};
type Client = Queryable & { release(): void };
type DatabasePool = Queryable & { connect(): Promise<Client> };

const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const packIdPattern = /^[a-z0-9][a-z0-9-]{1,119}$/;
const contentIdPattern = /^[a-z0-9][a-z0-9-]{0,127}$/;
const cefrPattern = /^(A1|A2|B1|B2|C1|C2)$/;
/**
 * Runs the canonical validator without letting malformed persisted data become a 500.
 *
 * `validateLearningVocabularyItem` assumes well-formed media entries and throws on an asset that
 * is missing `url`. Edits carry stored media through verbatim, so a legacy or hand-patched row
 * could otherwise crash the route. A throw is reported as a media issue instead, which surfaces in
 * the UI as a fixable validation error and leaves the transaction to roll back normally.
 */
function validateCanonicalContent(
  content: LearningVocabularyItem,
): Array<{ field: string; message: string }> {
  try {
    return validateLearningVocabularyItem(content);
  } catch {
    return [
      {
        field: 'media',
        message: 'رسانهٔ ذخیره‌شدهٔ این کارت ساختار معتبری ندارد و باید اصلاح شود.',
      },
    ];
  }
}
const partsOfSpeech = new Set<PartOfSpeech>([
  'noun',
  'verb',
  'adjective',
  'adverb',
  'phrase',
  'other',
]);
const germanArticles = new Set(['der', 'die', 'das']);

function isGermanArticle(value: string): value is 'der' | 'die' | 'das' {
  return germanArticles.has(value);
}

function isPartOfSpeech(value: string): value is PartOfSpeech {
  return (partsOfSpeech as ReadonlySet<string>).has(value);
}

function isCefrLevel(value: string): value is CefrLevel {
  return cefrPattern.test(value);
}

/** Statuses a draft edit may overwrite in place. Anything else gets a new draft version. */
const inPlaceEditableStatuses = new Set(['draft', 'ai_generated']);

const uuidNamespaceUrlHex = '6ba7b8119dad11d180b400c04fd430c8';

/** Deterministic uuid5, identical to the content-review store's helper. */
export function deterministicUuid5(name: string): string {
  const namespace = Buffer.from(uuidNamespaceUrlHex, 'hex');
  const digest = createHash('sha1')
    .update(Buffer.concat([namespace, Buffer.from(name, 'utf8')]))
    .digest()
    .subarray(0, 16);
  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const hex = digest.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalText(value: unknown, label: string, maximum: number): string | null {
  const text = trimmed(value);
  if (!text) return null;
  if (text.length > maximum) throw new Error(`${label} is too long.`);
  return text;
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

/**
 * Derives the canonical `cards.content_id` slug from a pack id and German headword, following the
 * shape already present in canonical data (`start-a1-apfel`): the article is dropped, umlauts are
 * transliterated the German way (ä→ae, ß→ss) and the remainder is lowercased and hyphenated.
 */
export function deriveContentId(packId: string, cefr: string, lemma: string): string {
  const base = trimmed(lemma)
    .replace(/^(der|die|das)\s+/i, '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const packPrefix = packId.replace(/^learnbox-/, '');
  return `${packPrefix}-${cefr.toLowerCase()}-${base}`.slice(0, 128);
}

/**
 * Builds a canonical `LearningVocabularyItem` from editor input. The `status`, `version` and
 * `media` fields are NOT caller-controlled: media stays as recorded (empty for new cards, since
 * media attachment is a separate authorized flow) and status is always a draft here.
 */
export function buildCardContent(
  input: CardContentInput,
  options: {
    contentId: string;
    version: number;
    media?: VersionedMediaAsset[];
    status?: ContentStatus;
  },
): LearningVocabularyItem {
  const article = optionalText(input.article, 'Article', 8);
  const partOfSpeech = trimmed(input.partOfSpeech);
  const cefr = trimmed(input.cefr);
  // `difficulty` is a 1..5 literal union in the canonical model. An out-of-range value is kept
  // verbatim so the canonical validator reports it, instead of being silently clamped.
  const difficulty = Number(input.difficulty) as LearningVocabularyItem['difficulty'];
  return {
    id: options.contentId,
    version: options.version,
    lemma: trimmed(input.lemma),
    normalizedLemma: trimmed(input.lemma)
      .replace(/^(der|die|das)\s+/i, '')
      .toLowerCase(),
    ...(article && isGermanArticle(article) ? { article } : {}),
    partOfSpeech: isPartOfSpeech(partOfSpeech) ? partOfSpeech : 'noun',
    persianMeanings: input.persianMeanings.map((meaning) => trimmed(meaning)).filter(Boolean),
    examples: input.examples
      .map((example) => ({ german: trimmed(example.german), persian: trimmed(example.persian) }))
      .filter((example) => example.german || example.persian),
    pronunciation: { ipa: trimmed(input.pronunciationIpa), locale: 'de-DE' },
    media: options.media ?? [],
    status: options.status ?? 'draft',
    source: { provider: 'editorial', reference: trimmed(input.sourceReference) },
    cefr: isCefrLevel(cefr) ? cefr : 'A1',
    essentialInflection: trimmed(input.essentialInflection),
    simpleGermanDefinition: trimmed(input.simpleGermanDefinition),
    grammarNote: trimmed(input.grammarNote),
    topicTags: input.topicTags.map((tag) => trimmed(tag)).filter(Boolean),
    difficulty,
    visualConcept: trimmed(input.visualConcept),
    imagePrompt: trimmed(input.imagePrompt),
    provenance: {
      sourceType: 'editorial',
      sourceReference: trimmed(input.sourceReference),
    },
  };
}

export class PostgresContentPacksWriteStore {
  constructor(private readonly pool: DatabasePool) {}

  /**
   * Content authoring requires an editorial role. Resolved from the database inside the caller's
   * transaction — identical gate to the read store and the content-review store.
   */
  private async assertRole(client: Queryable, actorUserId: string): Promise<boolean> {
    const roles = await client.query(
      `SELECT role
         FROM admin_role_assignments
        WHERE user_id = $1 AND role IN ('content_reviewer', 'super_admin')`,
      [actorUserId],
    );
    return roles.rows.length > 0;
  }

  /**
   * Replays a write by idempotency key. Returns the recorded entity id when this exact key was
   * already applied, so a retried request never creates a second pack or card version.
   *
   * Packs are keyed by a text slug while `audit_logs.entity_id` is `uuid NOT NULL`, so the real
   * pack id is carried in metadata and preferred here when present.
   */
  private async replay(
    client: Queryable,
    action: string,
    idempotencyKey: string,
  ): Promise<string | undefined> {
    const existing = await client.query(
      `SELECT entity_id, metadata->>'pack_id' AS pack_id
         FROM audit_logs
        WHERE action = $1 AND metadata->>'idempotency_key' = $2
        LIMIT 1`,
      [action, idempotencyKey],
    );
    const row = existing.rows[0];
    if (!row) return undefined;
    return row.pack_id ? String(row.pack_id) : String(row.entity_id);
  }

  /**
   * Stable surrogate uuid for a text-keyed entity.
   *
   * `audit_logs.entity_id` is `uuid NOT NULL`, but `packs.id` is a text slug. Widening the audit
   * column is a schema change this milestone is not authorised to make, so a pack audits under a
   * deterministic uuid derived from its slug and the slug itself is kept in `metadata.pack_id`.
   */
  private static surrogateUuid(value: string): string {
    const digest = createHash('sha256').update(`learnbox.pack:${value}`).digest('hex');
    return [
      digest.slice(0, 8),
      digest.slice(8, 12),
      `5${digest.slice(13, 16)}`,
      ((parseInt(digest.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0') +
        digest.slice(18, 20),
      digest.slice(20, 32),
    ].join('-');
  }

  private async audit(
    client: Queryable,
    actorUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    // Text-keyed packs audit under a deterministic surrogate uuid; the real slug stays in
    // metadata.pack_id so the audit trail and idempotency replay remain exact.
    const isUuid = canonicalUuidPattern.test(entityId);
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        actorUserId,
        action,
        entityType,
        isUuid ? entityId : PostgresContentPacksWriteStore.surrogateUuid(entityId),
        isUuid ? metadata : { ...metadata, pack_id: entityId },
      ],
    );
  }

  /** Creates a canonical pack. Always `status = 'draft'`; publication is a separate gate. */
  async createPack(input: PackUpsertInput & { actorUserId: string }): Promise<PackWriteResult> {
    const { actorUserId } = input;
    if (!canonicalUuidPattern.test(actorUserId)) throw new Error('Actor user id is invalid.');
    if (!canonicalUuidPattern.test(input.idempotencyKey)) {
      throw new Error('Idempotency key is invalid.');
    }

    const packId = trimmed(input.packId).toLowerCase();
    const displayName = trimmed(input.displayName);
    const issues: Array<{ field: string; message: string }> = [];
    if (!packIdPattern.test(packId)) {
      issues.push({ field: 'packId', message: 'شناسهٔ بسته باید حروف کوچک، رقم و خط تیره باشد.' });
    }
    if (!displayName) issues.push({ field: 'displayName', message: 'نام بسته الزامی است.' });
    if (displayName.length > 200) {
      issues.push({ field: 'displayName', message: 'نام بسته بیش از حد بلند است.' });
    }
    const targetCefr = trimmed(input.targetCefr) || 'A1';
    if (!cefrPattern.test(targetCefr)) {
      issues.push({ field: 'targetCefr', message: 'سطح بسته معتبر نیست.' });
    }
    const targetItemCount = Number(input.targetItemCount ?? 0);
    if (!Number.isInteger(targetItemCount) || targetItemCount < 0 || targetItemCount > 10_000) {
      issues.push({ field: 'targetItemCount', message: 'تعداد هدف باید عددی نامنفی باشد.' });
    }
    if (issues.length > 0) return { status: 'invalid', issues };

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (!(await this.assertRole(client, actorUserId))) {
        await client.query('ROLLBACK');
        return { status: 'forbidden' };
      }

      const replayed = await this.replay(client, 'content_pack.create', input.idempotencyKey);
      if (replayed) {
        await client.query('ROLLBACK');
        return { status: 'idempotent', packId: replayed };
      }

      const clash = await client.query('SELECT id FROM packs WHERE id = $1', [packId]);
      if (clash.rows.length > 0) {
        await client.query('ROLLBACK');
        return { status: 'conflict', reason: 'pack_exists' };
      }

      await client.query(
        `INSERT INTO packs
           (id, display_name, description, locale, target_cefr, target_item_count,
            category, is_free, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft')`,
        [
          packId,
          displayName,
          optionalText(input.description, 'Description', 2_000),
          trimmed(input.locale) || 'de-DE',
          targetCefr,
          targetItemCount,
          optionalText(input.category, 'Category', 120),
          input.isFree === true,
        ],
      );
      await this.audit(client, actorUserId, 'content_pack.create', 'pack', packId, {
        idempotency_key: input.idempotencyKey,
        display_name: displayName,
        target_cefr: targetCefr,
      });
      await client.query('COMMIT');
      return { status: 'applied', packId };
    } catch (error) {
      await client.query('ROLLBACK');
      if (isUniqueConstraintViolation(error)) return { status: 'conflict', reason: 'pack_exists' };
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Edits pack metadata. `id`, `status` and `published_at` are intentionally not editable here:
   * the id is the canonical join key used by `pack_cards` and the learner read model, and status
   * transitions belong to the publication gate.
   */
  async editPack(input: PackEditInput & { actorUserId: string }): Promise<PackWriteResult> {
    const { actorUserId } = input;
    if (!canonicalUuidPattern.test(actorUserId)) throw new Error('Actor user id is invalid.');
    if (!canonicalUuidPattern.test(input.idempotencyKey)) {
      throw new Error('Idempotency key is invalid.');
    }
    const packId = trimmed(input.packId).toLowerCase();
    if (!packIdPattern.test(packId)) return { status: 'not_found' };

    const issues: Array<{ field: string; message: string }> = [];
    const displayName = input.displayName === undefined ? undefined : trimmed(input.displayName);
    if (displayName !== undefined && !displayName) {
      issues.push({ field: 'displayName', message: 'نام بسته الزامی است.' });
    }
    const targetCefr = input.targetCefr === undefined ? undefined : trimmed(input.targetCefr);
    if (targetCefr !== undefined && !cefrPattern.test(targetCefr)) {
      issues.push({ field: 'targetCefr', message: 'سطح بسته معتبر نیست.' });
    }
    const targetItemCount =
      input.targetItemCount === undefined ? undefined : Number(input.targetItemCount);
    if (
      targetItemCount !== undefined &&
      (!Number.isInteger(targetItemCount) || targetItemCount < 0 || targetItemCount > 10_000)
    ) {
      issues.push({ field: 'targetItemCount', message: 'تعداد هدف باید عددی نامنفی باشد.' });
    }
    if (issues.length > 0) return { status: 'invalid', issues };

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (!(await this.assertRole(client, actorUserId))) {
        await client.query('ROLLBACK');
        return { status: 'forbidden' };
      }
      const replayed = await this.replay(client, 'content_pack.edit', input.idempotencyKey);
      if (replayed) {
        await client.query('ROLLBACK');
        return { status: 'idempotent', packId: replayed };
      }
      const current = await client.query('SELECT id FROM packs WHERE id = $1 FOR UPDATE', [packId]);
      if (current.rows.length === 0) {
        await client.query('ROLLBACK');
        return { status: 'not_found' };
      }

      await client.query(
        `UPDATE packs
            SET display_name      = COALESCE($2, display_name),
                description       = CASE WHEN $3::boolean THEN $4 ELSE description END,
                target_cefr       = COALESCE($5, target_cefr),
                category          = CASE WHEN $6::boolean THEN $7 ELSE category END,
                target_item_count = COALESCE($8, target_item_count),
                is_free           = COALESCE($9, is_free)
          WHERE id = $1`,
        [
          packId,
          displayName ?? null,
          input.description !== undefined,
          optionalText(input.description, 'Description', 2_000),
          targetCefr ?? null,
          input.category !== undefined,
          optionalText(input.category, 'Category', 120),
          targetItemCount ?? null,
          input.isFree === undefined ? null : input.isFree === true,
        ],
      );
      await this.audit(client, actorUserId, 'content_pack.edit', 'pack', packId, {
        idempotency_key: input.idempotencyKey,
        fields: Object.keys(input).filter(
          (key) => !['packId', 'idempotencyKey', 'actorUserId'].includes(key),
        ),
      });
      await client.query('COMMIT');
      return { status: 'applied', packId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Creates a card and attaches it to a pack in one transaction: `cards` row, a `draft`
   * `card_versions` row holding canonical `content_json`, and the `pack_cards` membership edge.
   */
  async createCard(input: CardCreateInput & { actorUserId: string }): Promise<CardWriteResult> {
    const { actorUserId } = input;
    if (!canonicalUuidPattern.test(actorUserId)) throw new Error('Actor user id is invalid.');
    if (!canonicalUuidPattern.test(input.idempotencyKey)) {
      throw new Error('Idempotency key is invalid.');
    }
    const packId = trimmed(input.packId).toLowerCase();
    if (!packIdPattern.test(packId)) return { status: 'not_found' };

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (!(await this.assertRole(client, actorUserId))) {
        await client.query('ROLLBACK');
        return { status: 'forbidden' };
      }
      const replayed = await this.replay(client, 'content_card.create', input.idempotencyKey);
      if (replayed) {
        await client.query('ROLLBACK');
        const version = await client.query(
          'SELECT id FROM card_versions WHERE card_id = $1 ORDER BY version DESC LIMIT 1',
          [replayed],
        );
        return {
          status: 'idempotent',
          cardId: replayed,
          cardVersionId: String(version.rows[0]?.id ?? ''),
        };
      }

      const pack = await client.query(
        'SELECT id, target_cefr FROM packs WHERE id = $1 FOR UPDATE',
        [packId],
      );
      if (pack.rows.length === 0) {
        await client.query('ROLLBACK');
        return { status: 'not_found' };
      }

      const cefr = trimmed(input.content.cefr) || String(pack.rows[0]!.target_cefr ?? 'A1');
      const contentId = deriveContentId(packId, cefr, input.content.lemma);
      if (!contentIdPattern.test(contentId)) {
        await client.query('ROLLBACK');
        return {
          status: 'invalid',
          issues: [{ field: 'lemma', message: 'واژهٔ آلمانی برای ساخت شناسه معتبر نیست.' }],
        };
      }

      const content = buildCardContent(
        { ...input.content, cefr },
        { contentId, version: 1, media: [], status: 'draft' },
      );
      const validation = validateCanonicalContent(content);
      if (validation.length > 0) {
        await client.query('ROLLBACK');
        return { status: 'invalid', issues: validation };
      }

      const existingContentId = await client.query('SELECT id FROM cards WHERE content_id = $1', [
        contentId,
      ]);
      if (existingContentId.rows.length > 0) {
        await client.query('ROLLBACK');
        return { status: 'conflict', reason: 'content_id_exists' };
      }

      const cardId = deterministicUuid5(`learnbox-card:${contentId}`);
      await client.query(
        `INSERT INTO cards (id, lemma, content_version, content_id) VALUES ($1, $2, 1, $3)`,
        [cardId, content.lemma, contentId],
      );
      const inserted = await client.query(
        `INSERT INTO card_versions
           (card_id, version, status, content_json, source_provider, source_reference)
         VALUES ($1, 1, 'draft', $2, 'editorial', $3)
         RETURNING id`,
        [cardId, content, content.provenance.sourceReference],
      );
      const cardVersionId = String(inserted.rows[0]!.id);

      const nextSort = await client.query(
        'SELECT COALESCE(max(sort_order), 0) + 1 AS next FROM pack_cards WHERE pack_id = $1',
        [packId],
      );
      const sortOrder = Number.isInteger(input.sortOrder)
        ? Number(input.sortOrder)
        : Number(nextSort.rows[0]!.next ?? 1);
      await client.query(
        'INSERT INTO pack_cards (pack_id, card_id, sort_order) VALUES ($1, $2, $3)',
        [packId, cardId, sortOrder],
      );

      await this.audit(client, actorUserId, 'content_card.create', 'card', cardId, {
        idempotency_key: input.idempotencyKey,
        pack_id: packId,
        content_id: contentId,
        card_version_id: cardVersionId,
      });
      await client.query('COMMIT');
      return { status: 'applied', cardId, cardVersionId, version: 1 };
    } catch (error) {
      await client.query('ROLLBACK');
      if (isUniqueConstraintViolation(error)) {
        return { status: 'conflict', reason: 'content_id_exists' };
      }
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Edits a card's educational content while preserving review integrity.
   *
   *  - current version is a draft → the draft is updated in place.
   *  - current version has left draft (reviewed/approved/published) → a NEW draft version is
   *    created. Reviewed content is never silently rewritten, and the published version a learner
   *    may be studying is never mutated.
   */
  async editCard(input: CardEditInput & { actorUserId: string }): Promise<CardWriteResult> {
    const { actorUserId } = input;
    if (!canonicalUuidPattern.test(actorUserId)) throw new Error('Actor user id is invalid.');
    if (!canonicalUuidPattern.test(input.idempotencyKey)) {
      throw new Error('Idempotency key is invalid.');
    }
    if (!canonicalUuidPattern.test(input.cardId)) return { status: 'not_found' };

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (!(await this.assertRole(client, actorUserId))) {
        await client.query('ROLLBACK');
        return { status: 'forbidden' };
      }
      const replayed = await this.replay(client, 'content_card.edit', input.idempotencyKey);
      if (replayed) {
        await client.query('ROLLBACK');
        const version = await client.query(
          'SELECT id FROM card_versions WHERE card_id = $1 ORDER BY version DESC LIMIT 1',
          [input.cardId],
        );
        return {
          status: 'idempotent',
          cardId: input.cardId,
          cardVersionId: String(version.rows[0]?.id ?? ''),
        };
      }

      const card = await client.query('SELECT id, content_id FROM cards WHERE id = $1 FOR UPDATE', [
        input.cardId,
      ]);
      if (card.rows.length === 0) {
        await client.query('ROLLBACK');
        return { status: 'not_found' };
      }
      const contentId = String(card.rows[0]!.content_id);

      const latest = await client.query(
        `SELECT id, version, status, content_json
           FROM card_versions
          WHERE card_id = $1
          ORDER BY version DESC
          LIMIT 1
          FOR UPDATE`,
        [input.cardId],
      );
      if (latest.rows.length === 0) {
        await client.query('ROLLBACK');
        return { status: 'not_found' };
      }
      const currentRow = latest.rows[0]!;
      const currentStatus = String(currentRow.status);
      const currentVersion = Number(currentRow.version);
      const currentContent = (currentRow.content_json ?? {}) as Record<string, unknown>;
      // Media is preserved verbatim: attaching or replacing media is a separate authorized flow.
      const preservedMedia = Array.isArray(currentContent.media) ? currentContent.media : [];

      const editsInPlace = inPlaceEditableStatuses.has(currentStatus);
      const nextVersion = editsInPlace ? currentVersion : currentVersion + 1;
      const content = buildCardContent(input.content, {
        contentId,
        version: nextVersion,
        media: preservedMedia,
        status: 'draft',
      });
      const validation = validateCanonicalContent(content);
      if (validation.length > 0) {
        await client.query('ROLLBACK');
        return { status: 'invalid', issues: validation };
      }

      let cardVersionId: string;
      if (editsInPlace) {
        const updated = await client.query(
          `UPDATE card_versions
              SET content_json = $2,
                  source_provider = 'editorial',
                  source_reference = $3
            WHERE id = $1
            RETURNING id`,
          [String(currentRow.id), content, content.provenance.sourceReference],
        );
        cardVersionId = String(updated.rows[0]!.id);
      } else {
        const created = await client.query(
          `INSERT INTO card_versions
             (card_id, version, status, content_json, source_provider, source_reference)
           VALUES ($1, $2, 'draft', $3, 'editorial', $4)
           RETURNING id`,
          [input.cardId, nextVersion, content, content.provenance.sourceReference],
        );
        cardVersionId = String(created.rows[0]!.id);
      }

      // `cards.lemma` is the canonical headword mirror; `content_id` stays immutable by trigger.
      await client.query('UPDATE cards SET lemma = $2, content_version = $3 WHERE id = $1', [
        input.cardId,
        content.lemma,
        nextVersion,
      ]);

      await this.audit(client, actorUserId, 'content_card.edit', 'card', input.cardId, {
        idempotency_key: input.idempotencyKey,
        card_version_id: cardVersionId,
        previous_status: currentStatus,
        mode: editsInPlace ? 'draft_in_place' : 'new_draft_version',
        version: nextVersion,
      });
      await client.query('COMMIT');
      return { status: 'applied', cardId: input.cardId, cardVersionId, version: nextVersion };
    } catch (error) {
      await client.query('ROLLBACK');
      if (isUniqueConstraintViolation(error)) {
        return { status: 'conflict', reason: 'version_exists' };
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
