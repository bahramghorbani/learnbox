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
  deriveCardImageSubject,
  effectiveImageSubjectSource,
  evaluateMediaValidity,
  imageSubjectMentionsBobo,
  resolveEffectiveGermanVoice,
  type GermanVoiceMapping,
  type LearnBoxImageStandard,
  type MediaValidity,
} from '@learnbox/content-models';

import { AiProviderError } from './ai-generation-provider';
import {
  germanVoiceIssue,
  GERMAN_VOICE_ISSUE_MESSAGES,
  type AiMediaLimits,
} from './ai-media-config';
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
  /** The exact image subject this candidate was generated for (null for legacy rows). */
  imageSubject: string | null;
  /** MP3 properties measured from the returned file; null for images and legacy rows. */
  audioFormat: { sampleRateHz: number; bitrateKbps: number; channels: number } | null;
  failureCode: string | null;
  createdAt: string;
}

export interface CardMediaKindState {
  kind: CardMediaKind;
  /** The currently accepted asset, or null when the card has no accepted media of this kind. */
  accepted: (CardMediaCandidateView & { acceptedAt: string }) | null;
  /** The newest candidate, which may be ready for review, failed, or still generating. */
  latestCandidate: CardMediaCandidateView | null;
  /** Whether the accepted asset still matches the card's current effective content. */
  acceptedValidity: MediaValidity | null;
  /** Whether a ready candidate awaiting acceptance matches the card's current content. */
  latestValidity: MediaValidity | null;
  /**
   * Whether generating this kind is actually needed: nothing valid is accepted, no valid candidate
   * awaits acceptance, nothing is generating, and accepted media is not merely unverifiable (which
   * is an owner decision, never an automatic regeneration).
   */
  needsGeneration: boolean;
}

export type GenerateOutcome =
  | { status: 'generated'; candidate: CardMediaCandidateView }
  | { status: 'already_generating' }
  /** Nothing generated: valid media already exists. Regeneration needs an explicit request. */
  | {
      status: 'not_needed';
      reason: 'accepted_valid' | 'ready_valid' | 'accepted_unverifiable';
      candidate: CardMediaCandidateView;
    }
  | { status: 'card_not_found' }
  | { status: 'forbidden' }
  | { status: 'unprocessable'; reason: string; code?: string }
  | { status: 'provider_failed'; code: string; message: string };

export type AcceptOutcome =
  | { status: 'accepted'; candidate: CardMediaCandidateView; replaced: boolean }
  | { status: 'already_accepted'; candidate: CardMediaCandidateView }
  | { status: 'candidate_not_found' }
  | { status: 'candidate_not_ready' }
  | { status: 'forbidden' };

interface CanonicalCardData {
  cardId: string;
  /** Latest canonical version used to bind an approved durable job to exact content. */
  versionId: string;
  contentId: string;
  lemma: string;
  article: string | null;
  firstGermanExample: string | null;
  visualConcept: string | null;
  imagePrompt: string | null;
  brief: string | null;
  /** The full persisted content of the version media is generated for. */
  content: Record<string, unknown>;
}

const CANDIDATE_COLUMNS = `id, card_id, kind, status, media_type, byte_size, checksum, provider,
  model, spoken_target, voice, voice_role, uses_die_fallback_for_das, language, locale,
  image_standard_version, image_subject, audio_sample_rate_hz, audio_bitrate_kbps, audio_channels,
  failure_code, created_at`;

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

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
    imageSubject: nullableText(row.image_subject),
    audioFormat:
      row.audio_sample_rate_hz === null || row.audio_sample_rate_hz === undefined
        ? null
        : {
            sampleRateHz: Number(row.audio_sample_rate_hz),
            bitrateKbps: Number(row.audio_bitrate_kbps),
            channels: Number(row.audio_channels),
          },
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
   * The newest version wins: it is the version that will be reviewed and published next, so its
   * media must match its text (owner rule 2026-10-16). For a card with no newer revision this is
   * the published version itself.
   */
  private async loadCard(
    client: Queryable,
    cardId: string,
  ): Promise<CanonicalCardData | undefined> {
    const result = await client.query(
      `SELECT c.id, c.content_id, c.lemma, cv.id AS version_id, cv.content_json
         FROM cards c
         JOIN card_versions cv ON cv.card_id = c.id
        WHERE c.id = $1
        ORDER BY cv.version DESC
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
      versionId: String(row.version_id),
      contentId,
      lemma: String(content.lemma ?? row.lemma),
      article: typeof content.article === 'string' ? content.article : null,
      firstGermanExample: firstGerman ?? null,
      visualConcept: typeof content.visualConcept === 'string' ? content.visualConcept : null,
      imagePrompt: typeof content.imagePrompt === 'string' ? content.imagePrompt : null,
      // A curated brief from the canonical visual contract outranks anything derived at runtime.
      brief: readCanonicalCardBrief(contentId) ?? null,
      content,
    };
  }

  /** Validity of recorded media against the card's current effective content. */
  private validity(candidate: CardMediaCandidateView, card: CanonicalCardData): MediaValidity {
    return evaluateMediaValidity(
      {
        kind: candidate.kind,
        spokenTarget: candidate.spokenTarget,
        voice: candidate.voice,
        voiceRole: candidate.voiceRole,
        imageSubject: candidate.imageSubject,
        imageStandardVersion: candidate.imageStandardVersion,
      },
      card.content,
      {
        imageBrief: card.brief,
        imageStandardVersion: this.imageStandard.version,
        voiceMapping: this.voices,
      },
    );
  }

  /** Existing media that makes a new generation unnecessary, if any. */
  private async existingSufficientMedia(
    client: Queryable,
    card: CanonicalCardData,
    kind: CardMediaKind,
  ): Promise<Extract<GenerateOutcome, { status: 'not_needed' }> | null> {
    const result = await client.query(
      `SELECT ${CANDIDATE_COLUMNS}, (status = 'accepted') AS is_accepted
         FROM card_media_candidates
        WHERE card_id = $1 AND kind = $2 AND status IN ('ready', 'accepted')
        ORDER BY created_at DESC`,
      [card.cardId, kind],
    );
    const rows = result.rows.map((row) => ({
      view: toCandidateView(row),
      accepted: row.is_accepted === true,
    }));
    const accepted = rows.find((row) => row.accepted);
    if (accepted) {
      const validity = this.validity(accepted.view, card);
      if (validity === 'valid') {
        return { status: 'not_needed', reason: 'accepted_valid', candidate: accepted.view };
      }
      if (validity === 'unverifiable') {
        return { status: 'not_needed', reason: 'accepted_unverifiable', candidate: accepted.view };
      }
    }
    const ready = rows.find((row) => !row.accepted && this.validity(row.view, card) === 'valid');
    return ready ? { status: 'not_needed', reason: 'ready_valid', candidate: ready.view } : null;
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
    /** Durable pack jobs bind approval to this exact canonical card version. */
    expectedCardVersionId?: string;
    model?: string;
    /**
     * Explicit Admin request to produce a new candidate even though valid media exists. Never set
     * by an automatic path (owner rule 2026-10-16).
     */
    regenerate?: boolean;
  }): Promise<GenerateOutcome> {
    const client = await this.pool.connect();
    let candidateId: string;
    let card: CanonicalCardData;
    let spokenTarget: string | null = null;
    let voice: string | null = null;
    let imageSubject: string | null = null;

    try {
      if (!(await this.hasEditorialRole(client, input.actorUserId))) return { status: 'forbidden' };

      const loaded = await this.loadCard(client, input.cardId);
      if (!loaded) return { status: 'card_not_found' };
      if (input.expectedCardVersionId && loaded.versionId !== input.expectedCardVersionId) {
        return {
          status: 'unprocessable',
          code: 'content_changed',
          reason: 'محتوای کارت پس از تأیید تغییر کرده است؛ ساخت خودکار متوقف شد.',
        };
      }
      card = loaded;

      if (!input.regenerate) {
        const sufficient = await this.existingSufficientMedia(client, card, input.kind);
        if (sufficient) return sufficient;
      }

      const capability = input.kind === 'image' ? 'image' : 'audio';
      const model =
        input.model?.trim() ||
        (capability === 'image' ? this.provider.imageModel : this.provider.audioModel);

      let voiceRole: string | null = null;
      let usesDieFallback = false;
      imageSubject =
        capability === 'image'
          ? deriveCardImageSubject(effectiveImageSubjectSource(card.content, card.brief))
          : null;
      // Bundled historical Starter images may remain, but a new candidate may never reproduce Bobo.
      if (imageSubject && imageSubjectMentionsBobo(imageSubject)) {
        return {
          status: 'unprocessable',
          reason: 'تصویر جدید نباید شامل بوبو یا شخصیت ماسکات باشد.',
        };
      }

      if (capability === 'audio') {
        // Any roster problem refuses all audio (single and bulk alike); no voice is substituted.
        const voiceIssue = germanVoiceIssue(this.voices, model);
        if (voiceIssue) {
          return {
            status: 'unprocessable',
            code: voiceIssue,
            reason: GERMAN_VOICE_ISSUE_MESSAGES[voiceIssue],
          };
        }
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
            uses_die_fallback_for_das, language, locale, image_standard_version, image_subject)
         VALUES ($1, $2, 'generating', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
          imageSubject,
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
      let audioFormat: { sampleRateHz: number; bitrateKbps: number; channels: number } | null =
        null;

      if (input.kind === 'image') {
        const image = await this.provider.generateImage({
          prompt: buildCardImagePrompt(
            effectiveImageSubjectSource(card.content, card.brief),
            this.imageStandard,
          ),
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
        // The measured format is recorded as-is; it is never assumed from the request.
        audioFormat = audio.format
          ? {
              sampleRateHz: audio.format.sampleRateHz,
              bitrateKbps: audio.format.bitrateKbps,
              channels: audio.format.channels,
            }
          : null;
        if (bytes.length > this.limits.maxAudioBytes) {
          throw new AiProviderError('provider_rejected', 'صدای تولیدشده از حد مجاز بزرگ‌تر است.');
        }
      }

      const stored = await this.storage.store(card.contentId, input.kind, mediaType, bytes);

      const updated = await this.pool.query(
        `UPDATE card_media_candidates
            SET status = 'ready', object_key = $2, checksum = $3, byte_size = $4, media_type = $5,
                estimated_cost_unit = $6, audio_sample_rate_hz = $7, audio_bitrate_kbps = $8,
                audio_channels = $9, updated_at = now()
          WHERE id = $1
          RETURNING ${CANDIDATE_COLUMNS}`,
        [
          candidateId,
          stored.objectKey,
          stored.checksum,
          stored.byteSize,
          mediaType,
          costUnit,
          audioFormat?.sampleRateHz ?? null,
          audioFormat?.bitrateKbps ?? null,
          audioFormat?.channels ?? null,
        ],
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
    const [card, acceptedRows, latestRows] = await Promise.all([
      this.loadCard(this.pool, cardId),
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
      const accepted = acceptedRow
        ? {
            ...toCandidateView(acceptedRow),
            acceptedAt:
              acceptedRow.accepted_at instanceof Date
                ? acceptedRow.accepted_at.toISOString()
                : String(acceptedRow.accepted_at),
          }
        : null;
      const latestCandidate = latestRow ? toCandidateView(latestRow) : null;
      const acceptedValidity = accepted && card ? this.validity(accepted, card) : null;
      const latestValidity =
        latestCandidate?.status === 'ready' && card ? this.validity(latestCandidate, card) : null;
      const needsGeneration =
        Boolean(card) &&
        acceptedValidity !== 'valid' &&
        acceptedValidity !== 'unverifiable' &&
        latestValidity !== 'valid' &&
        latestCandidate?.status !== 'generating';
      return {
        kind,
        accepted,
        latestCandidate,
        acceptedValidity,
        latestValidity,
        needsGeneration,
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
