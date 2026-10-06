/**
 * Phase 1 / Milestone 1.5 — the card media generation service.
 *
 * Three stages stay strictly separate, and this service is where that separation is enforced:
 *
 *   GENERATION   produces a candidate. A candidate is never canonical and never learner-visible.
 *                Generation writes NOTHING to `card_media_assets`, so a failed, rejected,
 *                abandoned or retried generation cannot disturb media that is already accepted.
 *   ACCEPTANCE   is an explicit Admin act. It is the only operation that changes which asset a card
 *                points at, and it is idempotent: the accepted-asset primary key is (card_id, kind),
 *                so replaying an acceptance rewrites one row to the same value instead of creating
 *                a second association.
 *   PUBLISHING   is not performed here at all. AI never publishes.
 *
 * Every spoken target and every voice is resolved by the canonical rules in
 * `@learnbox/content-models`, never by the provider and never by a prompt.
 */

import {
  buildCardImagePrompt,
  buildSpokenSentenceTarget,
  buildSpokenWordTarget,
  resolveEffectiveGermanVoice,
  type GermanVoiceMapping,
  type LearnBoxImageStandard,
} from '@learnbox/content-models';

import { AiProviderError } from './ai-generation-provider';
import type { AiMediaLimits } from './ai-media-config';
import type { AiMediaProvider } from './ai-media-provider';
import { readCanonicalCardBrief } from './canonical-image-standard';
import type { CardMediaKind, CardMediaStorage } from './card-media-storage';

type QueryResult = { rows: Record<string, unknown>[] };
type Queryable = { query(sql: string, parameters?: readonly unknown[]): Promise<QueryResult> };
type Client = Queryable & { release(): void };
type DatabasePool = Queryable & { connect(): Promise<Client> };

export type CardMediaCandidateStatus =
  'generating' | 'ready' | 'failed' | 'accepted' | 'superseded';

/** What the Admin is shown about one candidate. Never includes bytes or any credential. */
export interface CardMediaCandidateView {
  id: string;
  kind: CardMediaKind;
  status: CardMediaCandidateStatus;
  mediaType: string | null;
  byteSize: number | null;
  checksum: string | null;
  provider: string;
  model: string;
  /** The exact phrase that was spoken — proves a noun's word audio included its article. */
  spokenTarget: string | null;
  voice: string | null;
  voiceRole: string | null;
  usesDieFallbackForDas: boolean;
  language: string | null;
  locale: string | null;
  imageStandardVersion: string | null;
  failureCode: string | null;
  createdAt: string;
}

export interface CardMediaKindState {
  kind: CardMediaKind;
  /** The currently accepted asset, or null when the card has no accepted media of this kind. */
  accepted: (CardMediaCandidateView & { acceptedAt: string }) | null;
  /** The newest candidate, which may be ready for review, failed, or still generating. */
  latestCandidate: CardMediaCandidateView | null;
}

export type GenerateOutcome =
  | { status: 'generated'; candidate: CardMediaCandidateView }
  | { status: 'already_generating' }
  | { status: 'card_not_found' }
  | { status: 'forbidden' }
  | { status: 'unprocessable'; reason: string }
  | { status: 'provider_failed'; code: string; message: string };

export type AcceptOutcome =
  | { status: 'accepted'; candidate: CardMediaCandidateView; replaced: boolean }
  | { status: 'already_accepted'; candidate: CardMediaCandidateView }
  | { status: 'candidate_not_found' }
  | { status: 'candidate_not_ready' }
  | { status: 'forbidden' };

interface CanonicalCardData {
  cardId: string;
  contentId: string;
  lemma: string;
  article: string | null;
  firstGermanExample: string | null;
  visualConcept: string | null;
  brief: string | null;
}

const CANDIDATE_COLUMNS = `id, card_id, kind, status, media_type, byte_size, checksum, provider,
  model, spoken_target, voice, voice_role, uses_die_fallback_for_das, language, locale,
  image_standard_version, failure_code, created_at`;

function toCandidateView(row: Record<string, unknown>): CardMediaCandidateView {
  return {
    id: String(row.id),
    kind: row.kind as CardMediaKind,
    status: row.status as CardMediaCandidateStatus,
    mediaType: row.media_type === null ? null : String(row.media_type),
    byteSize: row.byte_size === null ? null : Number(row.byte_size),
    checksum: row.checksum === null ? null : String(row.checksum),
    provider: String(row.provider),
    model: String(row.model),
    spokenTarget: row.spoken_target === null ? null : String(row.spoken_target),
    voice: row.voice === null ? null : String(row.voice),
    voiceRole: row.voice_role === null ? null : String(row.voice_role),
    usesDieFallbackForDas: row.uses_die_fallback_for_das === true,
    language: row.language === null ? null : String(row.language),
    locale: row.locale === null ? null : String(row.locale),
    imageStandardVersion:
      row.image_standard_version === null ? null : String(row.image_standard_version),
    failureCode: row.failure_code === null ? null : String(row.failure_code),
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

const ALL_KINDS: CardMediaKind[] = ['image', 'word_audio', 'sentence_audio'];

export class CardMediaGenerationService {
  constructor(
    private readonly pool: DatabasePool,
    private readonly provider: AiMediaProvider,
    private readonly storage: CardMediaStorage,
    private readonly voices: GermanVoiceMapping,
    private readonly limits: AiMediaLimits,
    private readonly imageStandard: LearnBoxImageStandard,
  ) {}

  /** Content authoring role, identical to the gate M1.2's write store applies. */
  private async hasEditorialRole(client: Queryable, actorUserId: string): Promise<boolean> {
    const roles = await client.query(
      `SELECT role FROM admin_role_assignments
        WHERE user_id = $1 AND role IN ('content_reviewer', 'super_admin')`,
      [actorUserId],
    );
    return roles.rows.length > 0;
  }

  /**
   * Loads the canonical data a card's media must be generated from.
   *
   * The published version wins when one exists, so regenerating a live card reproduces the content
   * learners actually have; otherwise the highest draft version is used.
   */
  private async loadCard(
    client: Queryable,
    cardId: string,
  ): Promise<CanonicalCardData | undefined> {
    const result = await client.query(
      `SELECT c.id, c.content_id, c.lemma, cv.content_json
         FROM cards c
         JOIN card_versions cv ON cv.card_id = c.id
        WHERE c.id = $1
        ORDER BY (cv.status = 'published') DESC, cv.version DESC
        LIMIT 1`,
      [cardId],
    );
    const row = result.rows[0];
    if (!row) return undefined;

    const content = (row.content_json ?? {}) as Record<string, unknown>;
    const examples = Array.isArray(content.examples)
      ? (content.examples as Array<{ german?: unknown }>)
      : [];
    const firstGerman = examples
      .map((example) => (typeof example.german === 'string' ? example.german.trim() : ''))
      .find((german) => german.length > 0);

    const contentId = String(row.content_id);
    return {
      cardId: String(row.id),
      contentId,
      lemma: String(content.lemma ?? row.lemma),
      article: typeof content.article === 'string' ? content.article : null,
      firstGermanExample: firstGerman ?? null,
      visualConcept: typeof content.visualConcept === 'string' ? content.visualConcept : null,
      // A curated brief from the canonical visual contract outranks anything derived at runtime.
      brief: readCanonicalCardBrief(contentId) ?? null,
    };
  }

  /**
   * Generates one media candidate.
   *
   * The provider call happens outside any transaction, and the candidate row is written BEFORE the
   * call with its full attribution — the spoken target, the voice and the resolved voice role are
   * all known from canonical card data in advance. A crash mid-call therefore leaves a durable
   * `generating` row that recovery can see, never an untracked spend.
   */
  async generate(input: {
    cardId: string;
    kind: CardMediaKind;
    actorUserId: string;
    model?: string;
  }): Promise<GenerateOutcome> {
    const client = await this.pool.connect();
    let candidateId: string;
    let card: CanonicalCardData;
    let spokenTarget: string | null = null;
    let voice: string | null = null;

    try {
      if (!(await this.hasEditorialRole(client, input.actorUserId))) return { status: 'forbidden' };

      const loaded = await this.loadCard(client, input.cardId);
      if (!loaded) return { status: 'card_not_found' };
      card = loaded;

      const capability = input.kind === 'image' ? 'image' : 'audio';
      const model =
        input.model?.trim() ||
        (capability === 'image' ? this.provider.imageModel : this.provider.audioModel);

      let voiceRole: string | null = null;
      let usesDieFallback = false;

      if (capability === 'audio') {
        // Canonical rules decide what is spoken and who speaks it.
        try {
          spokenTarget =
            input.kind === 'word_audio'
              ? buildSpokenWordTarget(card)
              : buildSpokenSentenceTarget(card.firstGermanExample);
        } catch {
          return {
            status: 'unprocessable',
            reason:
              input.kind === 'word_audio'
                ? 'این کارت واژهٔ آلمانی قانونی ندارد.'
                : 'این کارت جملهٔ نمونهٔ آلمانی قانونی ندارد.',
          };
        }
        if (spokenTarget.length > this.limits.maxSpeechChars) {
          return { status: 'unprocessable', reason: 'متن گفتار از حد مجاز بلندتر است.' };
        }
        const effective = resolveEffectiveGermanVoice(card, this.voices);
        voice = effective.voice;
        voiceRole = effective.role;
        usesDieFallback = effective.usesDieFallbackForDas;
      }

      const inserted = await client.query(
        `INSERT INTO card_media_candidates
           (card_id, kind, status, provider, model, capability, spoken_target, voice, voice_role,
            uses_die_fallback_for_das, language, locale, image_standard_version)
         VALUES ($1, $2, 'generating', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          input.cardId,
          input.kind,
          this.provider.provider,
          model,
          capability,
          spokenTarget,
          voice,
          voiceRole,
          usesDieFallback,
          capability === 'audio' ? 'de' : null,
          capability === 'audio' ? 'de-DE' : null,
          capability === 'image' ? this.imageStandard.version : null,
        ],
      );
      // The single-flight unique index rejects a second concurrent attempt for this card and kind.
      if (!inserted.rows[0]) return { status: 'already_generating' };
      candidateId = String(inserted.rows[0].id);
    } finally {
      client.release();
    }

    // --- provider call, outside any transaction and holding no connection ---
    try {
      let bytes: Buffer;
      let mediaType: string;
      let costUnit: number | null = null;

      if (input.kind === 'image') {
        const image = await this.provider.generateImage({
          prompt: buildCardImagePrompt(card, this.imageStandard),
          model: input.model?.trim() || undefined,
          timeoutMs: this.limits.imageTimeoutMs,
        });
        bytes = image.bytes;
        mediaType = image.contentType;
        costUnit = image.estimatedCostUnit;
        if (bytes.length > this.limits.maxImageBytes) {
          throw new AiProviderError('provider_rejected', 'تصویر تولیدشده از حد مجاز بزرگ‌تر است.');
        }
      } else {
        const audio = await this.provider.synthesizeSpeech({
          text: spokenTarget!,
          voice: voice!,
          model: input.model?.trim() || undefined,
          timeoutMs: this.limits.audioTimeoutMs,
        });
        bytes = audio.bytes;
        mediaType = audio.contentType;
        if (bytes.length > this.limits.maxAudioBytes) {
          throw new AiProviderError('provider_rejected', 'صدای تولیدشده از حد مجاز بزرگ‌تر است.');
        }
      }

      const stored = await this.storage.store(card.contentId, input.kind, mediaType, bytes);

      const updated = await this.pool.query(
        `UPDATE card_media_candidates
            SET status = 'ready', object_key = $2, checksum = $3, byte_size = $4, media_type = $5,
                estimated_cost_unit = $6, updated_at = now()
          WHERE id = $1
          RETURNING ${CANDIDATE_COLUMNS}`,
        [candidateId, stored.objectKey, stored.checksum, stored.byteSize, mediaType, costUnit],
      );
      return { status: 'generated', candidate: toCandidateView(updated.rows[0]!) };
    } catch (error) {
      const code = error instanceof AiProviderError ? error.code : 'generation_failed';
      // The candidate is marked failed; accepted media is not touched by any path here.
      await this.pool.query(
        `UPDATE card_media_candidates
            SET status = 'failed', failure_code = $2, updated_at = now()
          WHERE id = $1`,
        [candidateId, code],
      );
      return {
        status: 'provider_failed',
        code,
        message: error instanceof AiProviderError ? error.message : 'تولید رسانه با خطا متوقف شد.',
      };
    }
  }

  /**
   * Accepts a candidate as the card's canonical media for its kind.
   *
   * Idempotent by construction: `card_media_assets` is keyed on (card_id, kind), so accepting the
   * same candidate again updates a single row to the same value. The previously accepted candidate
   * is marked superseded and keeps its row and its stored object, so acceptance history stays
   * auditable and nothing is destroyed.
   */
  async accept(input: {
    cardId: string;
    kind: CardMediaKind;
    candidateId: string;
    actorUserId: string;
  }): Promise<AcceptOutcome> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (!(await this.hasEditorialRole(client, input.actorUserId))) {
        await client.query('ROLLBACK');
        return { status: 'forbidden' };
      }

      const found = await client.query(
        `SELECT ${CANDIDATE_COLUMNS} FROM card_media_candidates
          WHERE id = $1 AND card_id = $2 AND kind = $3
          FOR UPDATE`,
        [input.candidateId, input.cardId, input.kind],
      );
      const row = found.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return { status: 'candidate_not_found' };
      }
      if (row.status === 'accepted') {
        await client.query('COMMIT');
        return { status: 'already_accepted', candidate: toCandidateView(row) };
      }
      if (row.status !== 'ready') {
        await client.query('ROLLBACK');
        return { status: 'candidate_not_ready' };
      }

      const previous = await client.query(
        `SELECT candidate_id FROM card_media_assets
          WHERE card_id = $1 AND kind = $2 FOR UPDATE`,
        [input.cardId, input.kind],
      );
      const previousCandidateId = previous.rows[0]?.candidate_id
        ? String(previous.rows[0].candidate_id)
        : null;

      await client.query(
        `INSERT INTO card_media_assets (card_id, kind, candidate_id, accepted_by_user_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (card_id, kind)
         DO UPDATE SET candidate_id = EXCLUDED.candidate_id,
                       accepted_by_user_id = EXCLUDED.accepted_by_user_id,
                       accepted_at = now()`,
        [input.cardId, input.kind, input.candidateId, input.actorUserId],
      );

      if (previousCandidateId && previousCandidateId !== input.candidateId) {
        await client.query(
          `UPDATE card_media_candidates
              SET status = 'superseded', superseded_by_candidate_id = $2, updated_at = now()
            WHERE id = $1`,
          [previousCandidateId, input.candidateId],
        );
      }

      const accepted = await client.query(
        `UPDATE card_media_candidates
            SET status = 'accepted', updated_at = now()
          WHERE id = $1
          RETURNING ${CANDIDATE_COLUMNS}`,
        [input.candidateId],
      );
      await client.query('COMMIT');
      return {
        status: 'accepted',
        candidate: toCandidateView(accepted.rows[0]!),
        replaced: Boolean(previousCandidateId && previousCandidateId !== input.candidateId),
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /** The per-kind media state the Admin workspace renders. */
  async getCardMediaState(cardId: string): Promise<CardMediaKindState[]> {
    const [acceptedRows, latestRows] = await Promise.all([
      this.pool.query(
        `SELECT a.kind, a.accepted_at, ${CANDIDATE_COLUMNS.split(',')
          .map((column) => `c.${column.trim()}`)
          .join(', ')}
           FROM card_media_assets a
           JOIN card_media_candidates c ON c.id = a.candidate_id
          WHERE a.card_id = $1`,
        [cardId],
      ),
      this.pool.query(
        `SELECT DISTINCT ON (kind) ${CANDIDATE_COLUMNS}
           FROM card_media_candidates
          WHERE card_id = $1
          ORDER BY kind, created_at DESC`,
        [cardId],
      ),
    ]);

    return ALL_KINDS.map((kind) => {
      const acceptedRow = acceptedRows.rows.find((row) => row.kind === kind);
      const latestRow = latestRows.rows.find((row) => row.kind === kind);
      return {
        kind,
        accepted: acceptedRow
          ? {
              ...toCandidateView(acceptedRow),
              acceptedAt:
                acceptedRow.accepted_at instanceof Date
                  ? acceptedRow.accepted_at.toISOString()
                  : String(acceptedRow.accepted_at),
            }
          : null,
        latestCandidate: latestRow ? toCandidateView(latestRow) : null,
      };
    });
  }

  /**
   * Reads candidate bytes for authenticated Admin preview and playback.
   *
   * Returns the object key's bytes only; a caller that is not an authenticated Admin never reaches
   * this method, and the bytes are never exposed on a public path.
   */
  async readCandidateMedia(
    candidateId: string,
    actorUserId: string,
  ): Promise<{ bytes: Buffer; mediaType: string; checksum: string } | 'forbidden' | 'not_found'> {
    const client = await this.pool.connect();
    try {
      if (!(await this.hasEditorialRole(client, actorUserId))) return 'forbidden';
      const result = await client.query(
        `SELECT object_key, media_type, checksum FROM card_media_candidates
          WHERE id = $1 AND object_key IS NOT NULL`,
        [candidateId],
      );
      const row = result.rows[0];
      if (!row) return 'not_found';
      const bytes = await this.storage.read(String(row.object_key));
      return { bytes, mediaType: String(row.media_type), checksum: String(row.checksum) };
    } finally {
      client.release();
    }
  }
}
