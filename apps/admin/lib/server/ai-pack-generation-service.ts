import { createHash, randomUUID } from 'node:crypto';

import {
  AiProviderError,
  type AiGenerationLimits,
  type AiModelRoles,
  type AiTextProvider,
} from './ai-generation-provider';
import {
  buildQualityReport,
  REPAIR_SYSTEM_PROMPT,
  REVIEWER_SYSTEM_PROMPT,
  buildRepairPrompt,
  buildReviewPrompt,
  reviewSummaryByRow,
  contentFields,
  isReadyRow,
  parseRepairReply,
  parseReviewReply,
  stateAfterReview,
  validatorFindings,
  type GeneratedRow,
  type QualityReport,
  type ReviewFinding,
  type RowReviewSummary,
} from './ai-card-review';
import { IMPORT_COLUMNS, type ImportColumnKey } from './content-import-contract';
import {
  rowIdempotencyKey,
  validateImportRecord,
  type ContentImportService,
  type ImportAnalysis,
} from './content-import-service';
import type { PostgresContentPacksWriteStore } from './postgres-content-packs-write-store';

/**
 * Phase 1 / Milestone 1.4 — AI-assisted pack generation.
 *
 * The flow is: prompt → structured plan → EXPLICIT Admin approval → batched generation job →
 * canonical analysis → EXPLICIT Admin selection → canonical draft cards.
 *
 * Three rules shape the whole design:
 *
 *  1. The model is an untrusted content source. Its output is coerced into the SAME canonical
 *     import records a CSV upload produces and then handed to `ContentImportService`, so AI
 *     content passes exactly the validation, duplicate and conflict policy M1.3 established.
 *     There is no second content model and no AI-only write path.
 *  2. Nothing canonical exists before acceptance. Generation writes only to `ai_generation_jobs`.
 *  3. AI cannot publish. Acceptance goes through M1.2's write store, which creates draft versions
 *     only; the normal review/publish lifecycle is the single way content becomes learner-visible.
 *
 * Batching is the minimum that makes progress real and failure honest: one provider call per
 * batch, each batch checkpointed into the job row, a single-flight lease so one job cannot fan out
 * into concurrent calls, and a bounded per-batch retry that resumes at the failed index instead of
 * regenerating what already succeeded. No queue, no worker, no scheduler.
 */

export type JobStatus = 'planned' | 'generating' | 'generated' | 'accepted' | 'failed';

export interface GenerationPlan {
  packId: string;
  title: string;
  description: string;
  audience: string;
  cefr: string;
  /** Count after server-side clamping. `requestedCount` keeps what the prompt asked for. */
  cardCount: number;
  requestedCount: number;
  topics: string[];
  strategy: string;
  fields: string[];
  scope: string;
  /** Admin-selected commercial state; never inferred by the model. */
  isFree: boolean;
}

export interface JobView {
  jobId: string;
  status: JobStatus;
  prompt: string;
  plan: GenerationPlan;
  planFingerprint: string;
  provider?: string;
  model?: string;
  reviewerModel?: string;
  repairModel?: string;
  quality?: QualityReport;
  progress: {
    requested: number;
    generated: number;
    batchSize: number;
    batchesDone: number;
    batchesTotal: number;
    attemptsOnCurrentBatch: number;
  };
  error?: { code: string; message: string };
  packId?: string;
}

export type PlanResult =
  | { status: 'ok'; job: JobView }
  | { status: 'invalid'; message: string }
  | { status: 'provider_error'; code: string; message: string }
  | { status: 'provider_not_configured' };

export type RunBatchResult =
  | { status: 'ok'; job: JobView }
  | { status: 'provider_not_configured' }
  | { status: 'not_found' }
  | { status: 'conflict'; message: string }
  | { status: 'stale'; message: string }
  | { status: 'failed'; job: JobView };

export type JobAnalysisResult =
  | {
      status: 'ok';
      job: JobView;
      analysis: ImportAnalysis;
      quality: QualityReport;
      reviews: Record<number, RowReviewSummary>;
    }
  | { status: 'not_found' };

export type RevisePlanResult =
  | { status: 'ok'; job: JobView }
  | { status: 'invalid'; message: string }
  | { status: 'stale'; message: string }
  | { status: 'conflict'; message: string }
  | { status: 'not_found' };

/** Fields the Admin may edit on a plan before generation starts. */
export interface PlanEdits {
  packId?: unknown;
  title?: unknown;
  description?: unknown;
  audience?: unknown;
  cefr?: unknown;
  cardCount?: unknown;
  topics?: unknown;
  strategy?: unknown;
  scope?: unknown;
  isFree?: unknown;
}

export type AcceptResult =
  | { status: 'ok'; job: JobView; created: number; skipped: number; packId: string }
  | { status: 'not_found' }
  | { status: 'conflict'; message: string }
  | { status: 'stale'; message: string }
  | { status: 'forbidden' };

type QueryResult = { rows: Record<string, unknown>[] };
type DatabasePool = { query(sql: string, parameters?: readonly unknown[]): Promise<QueryResult> };

/** Columns the model is asked to fill. Derived from the canonical contract, never hand-listed. */
const GENERATED_COLUMNS: ImportColumnKey[] = IMPORT_COLUMNS.map((column) => column.key);

const CEFR_PATTERN = /^(A1|A2|B1|B2|C1|C2)$/;
const PACK_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,119}$/;

const PLAN_SYSTEM_PROMPT = [
  'You plan German-for-Persian-speakers vocabulary packs for the LearnBox learning app.',
  'Convert the request into a generation PLAN only. Do not generate vocabulary cards yet.',
  'Reply with a single JSON object and no other text, using exactly these keys:',
  '{"packId","title","description","audience","cefr","cardCount","topics","strategy","scope"}',
  '- packId: lowercase ascii slug, hyphens only, 3-60 chars, descriptive of the pack.',
  '- title and description: Persian, written for an Iranian learner.',
  '- audience: Persian, who this pack is for.',
  '- cefr: exactly one of A1, A2, B1, B2, C1, C2 (pick the primary level if a range is asked).',
  '- cardCount: integer, how many cards the request asks for.',
  '- topics: 3-12 short Persian topic labels covering the requested domain.',
  '- strategy: Persian, one or two sentences on how topics are divided across the pack.',
  '- scope: Persian, what is explicitly in and out of scope.',
].join('\n');

const CARD_SYSTEM_PROMPT = [
  'You write German vocabulary cards for Persian-speaking learners of the LearnBox app.',
  'Reply with a single JSON object {"cards":[...]} and no other text.',
  'Each card is an object with exactly these keys:',
  JSON.stringify(GENERATED_COLUMNS),
  'Field rules:',
  '- lemma: the German headword, correctly capitalised (nouns capitalised).',
  '- article: der, die or das for nouns; empty string otherwise.',
  '- part_of_speech: one of noun, verb, adjective, adverb, phrase, other.',
  '- essential_inflection: plural for nouns, key forms for verbs; may be empty.',
  '- pronunciation_ipa: IPA without slashes; may be empty.',
  '- persian_meanings: one or more Persian meanings separated by «؛».',
  '- example_german and example_persian: one natural sentence and its Persian translation.',
  '  Supply BOTH or leave BOTH empty.',
  '- simple_german_definition: a short definition in simple German.',
  '- grammar_note: a short Persian note on the grammar point that matters for this word.',
  '- topic_tags: one or more Persian topic labels separated by «؛».',
  '- difficulty: integer 1-5.',
  '- cefr: the requested CEFR level for this card.',
  '- visual_concept: a short Persian description of an image that would teach this word.',
  '- image_prompt: a short English prompt describing that image.',
  '- source_reference: a short provenance string.',
  'Every field must be a string. Never return null. Never repeat a lemma already listed as taken.',
].join('\n');

function planFingerprintOf(plan: GenerationPlan): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        plan.packId,
        plan.title,
        plan.description,
        plan.audience,
        plan.cefr,
        plan.cardCount,
        plan.topics,
        plan.strategy,
        plan.scope,
        // Commercial state is part of what the Admin approves, so changing it must re-bind.
        plan.isFree === true,
      ]),
    )
    .digest('hex');
}

/** Pulls the first JSON object out of a model reply, tolerating code fences and prose. */
function parseJsonObject(text: string): Record<string, unknown> | undefined {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced?.[1], text];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end <= start) continue;
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1));
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Accepts a model id only if it looks like a catalog id, so an Admin-supplied value can never be
 * used to redirect the request or smuggle characters into the provider payload.
 */
export function normalizeModelSelection(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim();
  if (!value || value.length > 120) return undefined;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) return undefined;
  if (!value.toLowerCase().includes('claude')) return undefined;
  return value;
}

class PlanEditError extends Error {}

export class AiPackGenerationService {
  constructor(
    private readonly pool: DatabasePool,
    /**
     * Absent when no credential is configured. Only `plan` and `runNextBatch` need it; inspecting
     * and accepting an already-generated job must keep working without one.
     */
    private readonly provider: AiTextProvider | undefined,
    private readonly limits: AiGenerationLimits,
    private readonly importService: ContentImportService,
    private readonly writeStore: Pick<PostgresContentPacksWriteStore, 'createPack'>,
    /** Supplied by the canonical server. Omitted only by legacy unit harnesses. */
    private readonly models?: AiModelRoles,
  ) {}

  /**
   * Turns a natural-language request into a structured, server-clamped plan and persists it as a
   * `planned` job. No cards are generated here — that is the point of the plan gate.
   */
  async plan(input: {
    prompt: string;
    actorUserId: string;
    /** Admin-selected text model; the configured default is used when absent. */
    model?: string;
    /** Explicit Admin choice. Defaults to paid to preserve historical behavior. */
    isFree?: boolean;
  }): Promise<PlanResult> {
    const provider = this.provider;
    if (!provider) return { status: 'provider_not_configured' };
    const model = normalizeModelSelection(input.model) ?? this.models?.generator ?? provider.model;
    const prompt = input.prompt.trim();
    if (!prompt) return { status: 'invalid', message: 'توضیح بسته را وارد کنید.' };
    if (prompt.length > this.limits.maxPromptChars) {
      return {
        status: 'invalid',
        message: `توضیح بسته باید کوتاه‌تر از ${this.limits.maxPromptChars} نویسه باشد.`,
      };
    }

    let reply: string;
    try {
      reply = await provider.complete({
        system: PLAN_SYSTEM_PROMPT,
        user: prompt,
        // Same generator budget as card batches: a hard-coded small cap here could cut a plan
        // off, and the provider rejects any reply that did not finish on its own.
        maxOutputTokens: this.limits.maxOutputTokens,
        timeoutMs: this.limits.perCallTimeoutMs,
        model,
      });
    } catch (error) {
      if (error instanceof AiProviderError) {
        return { status: 'provider_error', code: error.code, message: error.message };
      }
      return {
        status: 'provider_error',
        code: 'provider_unavailable',
        message: 'ساخت طرح با خطا روبه‌رو شد.',
      };
    }

    const parsed = parseJsonObject(reply);
    if (!parsed) {
      return {
        status: 'provider_error',
        code: 'provider_invalid_plan',
        message: 'طرح برگشتی از سرویس هوش مصنوعی ساختار معتبری نداشت.',
      };
    }

    const plan = this.buildPlan(parsed, prompt, input.isFree === true);
    if (!plan) {
      return {
        status: 'provider_error',
        code: 'provider_invalid_plan',
        message: 'طرح برگشتی از سرویس هوش مصنوعی کامل نبود.',
      };
    }

    // A plan must never target an existing pack: accepting into it could accidentally mingle an
    // AI proposal with canonical content. The Admin can revise the title/topic and request a new plan.
    const existingPack = await this.pool.query('SELECT 1 FROM packs WHERE id = $1 LIMIT 1', [
      plan.packId,
    ]);
    if (existingPack.rows.length > 0) {
      return {
        status: 'invalid',
        message: 'شناسهٔ پیشنهادی بسته تکراری است؛ عنوان یا موضوع را اصلاح کنید.',
      };
    }
    const jobId = randomUUID();
    const fingerprint = planFingerprintOf(plan);
    const batchSize = Math.min(this.limits.batchSize, plan.cardCount);
    await this.pool.query(
      `INSERT INTO ai_generation_jobs
         (id, actor_user_id, prompt, plan, plan_fingerprint, status, requested_count, batch_size,
          provider, model, reviewer_model, repair_model)
       VALUES ($1, $2, $3, $4::jsonb, $5, 'planned', $6, $7, $8, $9, $10, $11)`,
      [
        jobId,
        input.actorUserId,
        prompt,
        JSON.stringify(plan),
        fingerprint,
        plan.cardCount,
        batchSize,
        provider.provider,
        model,
        this.models?.reviewer,
        this.models?.repair,
      ],
    );

    const job = await this.load(jobId, input.actorUserId);
    return job ? { status: 'ok', job } : { status: 'invalid', message: 'طرح ذخیره نشد.' };
  }

  /** Validates and clamps the model's plan. Returns undefined when required parts are unusable. */
  private buildPlan(
    raw: Record<string, unknown>,
    prompt: string,
    isFree: boolean,
  ): GenerationPlan | undefined {
    const title = asString(raw.title);
    const cefrRaw = asString(raw.cefr).toUpperCase();
    if (!title) return undefined;
    if (!CEFR_PATTERN.test(cefrRaw)) return undefined;

    const requestedCount = Number(asString(raw.cardCount));
    if (!Number.isSafeInteger(requestedCount) || requestedCount <= 0) return undefined;
    // Cost ceiling: the prompt may ask for any number, the job never exceeds the server limit.
    const cardCount = Math.min(requestedCount, this.limits.maxCards);

    const packIdRaw = slugify(asString(raw.packId) || title);
    const packId = PACK_ID_PATTERN.test(packIdRaw) ? packIdRaw : '';
    if (!packId) return undefined;

    const topics = Array.isArray(raw.topics)
      ? raw.topics.map(asString).filter(Boolean).slice(0, 12)
      : [];

    return {
      packId,
      title,
      description: asString(raw.description),
      audience: asString(raw.audience),
      cefr: cefrRaw,
      cardCount,
      requestedCount,
      topics,
      strategy: asString(raw.strategy),
      scope: asString(raw.scope) || prompt,
      // Reported, not model-chosen: the canonical contract decides which fields a card carries.
      fields: GENERATED_COLUMNS,
      isFree,
    };
  }

  /**
   * Applies the Admin's direct edits to a plan that has not started generating.
   *
   * Every field is re-validated server-side with the same limits a model-proposed plan gets (the
   * card count is still capped by `maxCards`), the pack id must stay unique, and the update is bound
   * to the fingerprint the Admin edited, so two tabs cannot silently overwrite each other. The new
   * fingerprint is what `approvePlan` then requires: the approved plan is exactly the edited one.
   */
  async revisePlan(input: {
    jobId: string;
    actorUserId: string;
    expectedPlanFingerprint: string;
    edits: PlanEdits;
  }): Promise<RevisePlanResult> {
    const job = await this.load(input.jobId, input.actorUserId);
    if (!job) return { status: 'not_found' };
    if (job.status !== 'planned') {
      return { status: 'conflict', message: 'تولید این طرح شروع شده و طرح دیگر قابل ویرایش نیست.' };
    }
    if (job.planFingerprint !== input.expectedPlanFingerprint) {
      return {
        status: 'stale',
        message: 'طرح در این فاصله تغییر کرده است؛ آن را دوباره باز کنید.',
      };
    }

    const edited = this.applyPlanEdits(job.plan, input.edits);
    if ('message' in edited) return { status: 'invalid', message: edited.message };
    const plan = edited.plan;
    if (plan.packId !== job.plan.packId) {
      const existing = await this.pool.query('SELECT 1 FROM packs WHERE id = $1 LIMIT 1', [
        plan.packId,
      ]);
      if (existing.rows.length > 0) {
        return { status: 'invalid', message: 'این شناسهٔ بسته قبلاً استفاده شده است.' };
      }
    }

    const fingerprint = planFingerprintOf(plan);
    const updated = await this.pool.query(
      `UPDATE ai_generation_jobs
          SET plan = $4::jsonb, plan_fingerprint = $5, requested_count = $6, batch_size = $7,
              updated_at = now()
        WHERE id = $1 AND actor_user_id = $2 AND status = 'planned' AND plan_fingerprint = $3
        RETURNING id`,
      [
        input.jobId,
        input.actorUserId,
        input.expectedPlanFingerprint,
        JSON.stringify(plan),
        fingerprint,
        plan.cardCount,
        Math.min(this.limits.batchSize, plan.cardCount),
      ],
    );
    if (updated.rows.length === 0) {
      return {
        status: 'stale',
        message: 'طرح در این فاصله تغییر کرده است؛ آن را دوباره باز کنید.',
      };
    }
    const after = await this.load(input.jobId, input.actorUserId);
    return after ? { status: 'ok', job: after } : { status: 'not_found' };
  }

  /** Validates Admin edits against the same rules as a generated plan. Pure. */
  private applyPlanEdits(
    current: GenerationPlan,
    edits: PlanEdits,
  ): { plan: GenerationPlan } | { message: string } {
    const textField = (value: unknown, fallback: string, maximum: number, label: string) => {
      if (value === undefined) return fallback;
      if (typeof value !== 'string') throw new PlanEditError(`${label} معتبر نیست.`);
      const trimmed = value.trim();
      if (trimmed.length > maximum) {
        throw new PlanEditError(`${label} باید حداکثر ${maximum} نویسه باشد.`);
      }
      return trimmed;
    };
    try {
      const title = textField(edits.title, current.title, 120, 'عنوان');
      if (!title) throw new PlanEditError('عنوان بسته خالی است.');
      const packId = textField(edits.packId, current.packId, 60, 'شناسهٔ بسته');
      if (!PACK_ID_PATTERN.test(packId)) {
        throw new PlanEditError(
          'شناسهٔ بسته فقط حروف کوچک لاتین، عدد و خط تیره می‌پذیرد و با حرف یا عدد شروع می‌شود.',
        );
      }
      const cefr = textField(edits.cefr, current.cefr, 2, 'سطح').toUpperCase();
      if (!CEFR_PATTERN.test(cefr)) throw new PlanEditError('سطح باید یکی از A1 تا C2 باشد.');

      let cardCount = current.cardCount;
      if (edits.cardCount !== undefined) {
        const value = edits.cardCount;
        if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
          throw new PlanEditError('تعداد کارت باید عدد صحیح مثبت باشد.');
        }
        if (value > this.limits.maxCards) {
          throw new PlanEditError(`تعداد کارت حداکثر ${this.limits.maxCards} است.`);
        }
        cardCount = value;
      }

      let topics = current.topics;
      if (edits.topics !== undefined) {
        if (!Array.isArray(edits.topics) || !edits.topics.every((t) => typeof t === 'string')) {
          throw new PlanEditError('فهرست موضوع‌ها معتبر نیست.');
        }
        topics = [...new Set((edits.topics as string[]).map((t) => t.trim()).filter(Boolean))];
        if (topics.length === 0) throw new PlanEditError('دست‌کم یک موضوع لازم است.');
        if (topics.length > 12) throw new PlanEditError('حداکثر ۱۲ موضوع مجاز است.');
        if (topics.some((t) => t.length > 80)) {
          throw new PlanEditError('هر موضوع باید حداکثر ۸۰ نویسه باشد.');
        }
      }

      if (edits.isFree !== undefined && typeof edits.isFree !== 'boolean') {
        throw new PlanEditError('وضعیت رایگان/پولی معتبر نیست.');
      }

      return {
        plan: {
          ...current,
          packId,
          title,
          description: textField(edits.description, current.description, 1000, 'توضیح'),
          audience: textField(edits.audience, current.audience, 300, 'مخاطب'),
          cefr,
          cardCount,
          topics,
          strategy: textField(edits.strategy, current.strategy, 1000, 'راهبرد'),
          scope: textField(edits.scope, current.scope, 1000, 'دامنه'),
          isFree: edits.isFree === undefined ? current.isFree : (edits.isFree as boolean),
        },
      };
    } catch (error) {
      if (error instanceof PlanEditError) return { message: error.message };
      throw error;
    }
  }

  /**
   * Moves an approved plan into generation. Requires the fingerprint of the plan the Admin saw,
   * so a plan that changed underneath cannot be silently generated.
   */
  async approvePlan(input: {
    jobId: string;
    actorUserId: string;
    expectedPlanFingerprint: string;
  }): Promise<RunBatchResult> {
    const job = await this.load(input.jobId, input.actorUserId);
    if (!job) return { status: 'not_found' };
    if (job.planFingerprint !== input.expectedPlanFingerprint) {
      return { status: 'stale', message: 'طرح تغییر کرده است. دوباره طرح بگیرید.' };
    }
    if (job.status !== 'planned') {
      return { status: 'conflict', message: 'این طرح قبلاً تأیید شده است.' };
    }
    await this.pool.query(
      `UPDATE ai_generation_jobs
          SET status = 'generating', updated_at = now()
        WHERE id = $1 AND actor_user_id = $2 AND status = 'planned'`,
      [input.jobId, input.actorUserId],
    );
    const updated = await this.load(input.jobId, input.actorUserId);
    return updated ? { status: 'ok', job: updated } : { status: 'not_found' };
  }

  /**
   * Generates ONE batch and checkpoints it.
   *
   * Called repeatedly by the Admin UI while the job is `generating`, which keeps progress real
   * (it reflects rows actually returned) without a background worker. The lease makes the call
   * single-flight per job, so polling faster cannot multiply provider calls.
   */
  async runNextBatch(input: { jobId: string; actorUserId: string }): Promise<RunBatchResult> {
    // Checked before the lease is taken, so a missing credential never leaves a job leased.
    const provider = this.provider;
    if (!provider) return { status: 'provider_not_configured' };
    const leaseSeconds = Math.ceil(this.limits.perCallTimeoutMs / 1000) + 30;
    // Single-flight: whoever wins this UPDATE owns the batch until the lease expires.
    const leased = await this.pool.query(
      `UPDATE ai_generation_jobs
          SET lease_until = now() + ($3 || ' seconds')::interval, updated_at = now()
        WHERE id = $1 AND actor_user_id = $2 AND status = 'generating'
          AND (lease_until IS NULL OR lease_until < now())
        RETURNING id`,
      [input.jobId, input.actorUserId, String(leaseSeconds)],
    );
    if (leased.rows.length === 0) {
      const current = await this.load(input.jobId, input.actorUserId);
      if (!current) return { status: 'not_found' };
      if (current.status !== 'generating') {
        return { status: 'conflict', message: 'این مرحله از تولید فعال نیست.' };
      }
      return { status: 'conflict', message: 'یک دستهٔ دیگر در حال تولید است.' };
    }

    const job = await this.load(input.jobId, input.actorUserId);
    if (!job) return { status: 'not_found' };

    const remaining = job.plan.cardCount - job.progress.generated;
    if (remaining <= 0) {
      await this.finishGeneration(input.jobId);
      const done = await this.load(input.jobId, input.actorUserId);
      return done ? { status: 'ok', job: done } : { status: 'not_found' };
    }

    const batchCount = Math.min(job.progress.batchSize, remaining);
    const takenLemmas = await this.loadLemmas(input.jobId);

    let reply: string;
    try {
      reply = await provider.complete({
        system: CARD_SYSTEM_PROMPT,
        user: this.buildBatchPrompt(job, batchCount, takenLemmas),
        maxOutputTokens: this.limits.maxOutputTokens,
        timeoutMs: this.limits.perCallTimeoutMs,
        // Pinned to the job's recorded model, so every batch of one pack is generated by the
        // model the Admin approved the plan under — not whatever the default later becomes.
        model: job.model ?? this.models?.generator ?? provider.model,
      });
    } catch (error) {
      const code = error instanceof AiProviderError ? error.code : 'provider_unavailable';
      const message = error instanceof AiProviderError ? error.message : 'تولید با خطا روبه‌رو شد.';
      return this.recordBatchFailure(input, code, message);
    }

    const records = this.extractRecords(reply);
    if (records.length === 0) {
      return this.recordBatchFailure(
        input,
        'provider_empty_response',
        'این دسته هیچ کارت قابل استفاده‌ای برنگرداند.',
      );
    }

    // Reviewer and repair calls are intentionally independent from generation. The reviewer gets
    // the card fields and the published learning context only, never the generation prompt or model
    // reasoning. A reviewer failure fails this batch: silently treating it as approval would let
    // unreviewed content enter the human queue.
    let reviewed = records.slice(0, batchCount) as GeneratedRow[];
    if (this.models) {
      try {
        reviewed = await this.reviewAndRepairBatch(reviewed, job);
      } catch (error) {
        const code = error instanceof AiProviderError ? error.code : 'reviewer_unavailable';
        const message =
          error instanceof AiProviderError ? error.message : 'بازبینی مستقل با خطا روبه‌رو شد.';
        return this.recordBatchFailure(input, code, message);
      }
    }

    // Checkpoint: append the reviewed batch, advance the resume point, clear the retry counter and
    // lease. A later batch failing can never discard a completed review.
    await this.pool.query(
      `UPDATE ai_generation_jobs
          SET generated_rows = generated_rows || $3::jsonb,
              next_batch_index = next_batch_index + 1,
              batch_attempts = 0,
              error_code = NULL,
              error_message = NULL,
              lease_until = NULL,
              updated_at = now()
        WHERE id = $1 AND actor_user_id = $2`,
      [input.jobId, input.actorUserId, JSON.stringify(reviewed)],
    );

    const after = await this.load(input.jobId, input.actorUserId);
    if (!after) return { status: 'not_found' };
    if (after.progress.generated >= after.plan.cardCount) {
      await this.finishGeneration(input.jobId);
      const done = await this.load(input.jobId, input.actorUserId);
      return done ? { status: 'ok', job: done } : { status: 'not_found' };
    }
    return { status: 'ok', job: after };
  }

  /** Runs the independent reviewer, then bounded repair/re-review rounds. */
  private async reviewAndRepairBatch(
    initial: GeneratedRow[],
    job: JobView,
  ): Promise<GeneratedRow[]> {
    const rows = initial.map((row) => ({ ...row }));
    const reviewerModel = job.reviewerModel ?? this.models!.reviewer;
    const repairModel = job.repairModel ?? this.models!.repair;
    let indexes = rows.map((_, index) => index);
    for (let reviewPass = 0; indexes.length > 0; reviewPass += 1) {
      // Canonical validation first. A card LearnBox itself rejects gets its validator issues as
      // critical findings and goes through the SAME bounded repair and re-check as a reviewer
      // finding; spending a reviewer call on it first would review content that cannot be kept.
      const invalid = new Map<number, ReviewFinding[]>();
      for (const index of indexes) {
        const checked = validateImportRecord(
          contentFields(rows[index]!),
          index + 1,
          job.plan.packId,
          job.plan.cefr,
        );
        if (!checked.ok) invalid.set(index, validatorFindings(checked.issues));
      }
      const toReview = indexes.filter((index) => !invalid.has(index));
      const reviewed =
        toReview.length > 0
          ? ((await this.callReviewer(rows, toReview, job.plan, reviewerModel)) ?? new Map())
          : new Map<number, ReviewFinding[]>();
      for (const index of indexes) {
        const prior = rows[index]!._review;
        const findings = invalid.get(index) ??
          reviewed.get(index) ?? [
            {
              field: 'card',
              severity: 'critical' as const,
              reason: 'بازبین برای این کارت پاسخ معتبر نداد.',
              suggestion: '',
              source: 'reviewer' as const,
            },
          ];
        const repairRounds = prior?.repairRounds ?? 0;
        rows[index]!._review = {
          state: stateAfterReview(findings, repairRounds, this.limits.maxRepairRounds),
          findings,
          repairRounds,
          repaired: prior?.repaired ?? false,
          reviewerModel,
          repairModel,
          original: prior?.original,
          history: [...(prior?.history ?? []), { round: repairRounds, findings }],
        };
      }
      const repairable = indexes.filter((index) => rows[index]!._review?.state === 'needs_repair');
      if (repairable.length === 0) break;
      const repaired =
        (await this.callRepair(rows, repairable, job.plan, repairModel)) ?? new Map();
      for (const index of repairable) {
        const replacement = repaired.get(index);
        const prior = rows[index]!._review!;
        if (!replacement) {
          rows[index]!._review = {
            ...prior,
            repairRounds: prior.repairRounds + 1,
            state: 'unresolved',
          };
          continue;
        }
        rows[index] = {
          ...replacement,
          _review: {
            ...prior,
            repairRounds: prior.repairRounds + 1,
            repaired: true,
            original: prior.original ?? contentFields(rows[index]!),
            state: 'pending',
          },
        };
      }
      indexes = repairable.filter((index) => rows[index]!._review?.state === 'pending');
    }
    return rows;
  }

  private async callReviewer(
    rows: GeneratedRow[],
    indexes: number[],
    plan: GenerationPlan,
    reviewerModel: string,
  ) {
    const reply = await this.provider!.complete({
      system: REVIEWER_SYSTEM_PROMPT,
      user: buildReviewPrompt({
        packTitle: plan.title,
        cefr: plan.cefr,
        cards: indexes.map((index) => ({ index, row: rows[index]! })),
      }),
      maxOutputTokens: this.limits.reviewerMaxOutputTokens,
      timeoutMs: this.limits.perCallTimeoutMs,
      model: reviewerModel,
    });
    return parseReviewReply(parseJsonObject(reply), indexes);
  }

  private async callRepair(
    rows: GeneratedRow[],
    indexes: number[],
    plan: GenerationPlan,
    repairModel: string,
  ) {
    const reply = await this.provider!.complete({
      system: REPAIR_SYSTEM_PROMPT,
      user: buildRepairPrompt({
        packTitle: plan.title,
        cefr: plan.cefr,
        cards: indexes.map((index) => ({ index, row: rows[index]! })),
      }),
      maxOutputTokens: this.limits.reviewerMaxOutputTokens,
      timeoutMs: this.limits.perCallTimeoutMs,
      model: repairModel,
    });
    return parseRepairReply(parseJsonObject(reply), indexes);
  }

  private buildBatchPrompt(job: JobView, batchCount: number, taken: string[]): string {
    const lines = [
      `Pack: ${job.plan.title}`,
      `Description: ${job.plan.description}`,
      `Audience: ${job.plan.audience}`,
      `CEFR level: ${job.plan.cefr}`,
      `Topic strategy: ${job.plan.strategy}`,
      `Topics: ${job.plan.topics.join(', ')}`,
      `Original request: ${job.prompt}`,
      '',
      `Generate exactly ${batchCount} NEW cards at CEFR ${job.plan.cefr}.`,
    ];
    if (taken.length > 0) {
      // Bounded: the tail is enough to stop near-duplicates without an unbounded prompt.
      const recent = taken.slice(-300);
      lines.push(`Already taken lemmas, do not repeat any of these: ${recent.join(', ')}`);
    }
    return lines.join('\n');
  }

  /** Coerces model output into canonical import records. Unusable entries are dropped here. */
  private extractRecords(reply: string): Array<Partial<Record<ImportColumnKey, string>>> {
    const parsed = parseJsonObject(reply);
    const cards = parsed && Array.isArray(parsed.cards) ? parsed.cards : undefined;
    if (!cards) return [];
    const records: Array<Partial<Record<ImportColumnKey, string>>> = [];
    for (const card of cards) {
      if (typeof card !== 'object' || card === null) continue;
      const source = card as Record<string, unknown>;
      const record: Partial<Record<ImportColumnKey, string>> = {};
      for (const key of GENERATED_COLUMNS) {
        const value = asString(source[key]);
        if (value) record[key] = value;
      }
      // A record with no lemma cannot even be reported usefully as an invalid row.
      if (record.lemma) records.push(record);
    }
    return records;
  }

  private async recordBatchFailure(
    input: { jobId: string; actorUserId: string },
    code: string,
    message: string,
  ): Promise<RunBatchResult> {
    // The attempt counter advances on the SAME batch index, so a retry resumes rather than skips.
    const updated = await this.pool.query(
      `UPDATE ai_generation_jobs
          SET batch_attempts = batch_attempts + 1,
              error_code = $3,
              error_message = $4,
              lease_until = NULL,
              status = CASE WHEN batch_attempts + 1 >= $5 THEN 'failed' ELSE status END,
              updated_at = now()
        WHERE id = $1 AND actor_user_id = $2
        RETURNING status`,
      [input.jobId, input.actorUserId, code, message, this.limits.maxBatchAttempts],
    );
    if (updated.rows.length === 0) return { status: 'not_found' };
    const job = await this.load(input.jobId, input.actorUserId);
    if (!job) return { status: 'not_found' };
    // Exhausted retries → the job reports failure honestly and keeps its partial rows.
    if (job.status === 'failed') return { status: 'failed', job };
    return { status: 'conflict', message };
  }

  private async finishGeneration(jobId: string): Promise<void> {
    await this.pool.query(
      `UPDATE ai_generation_jobs
          SET status = 'generated', lease_until = NULL, updated_at = now()
        WHERE id = $1 AND status = 'generating'`,
      [jobId],
    );
  }

  /**
   * Returns the job plus a canonical analysis of everything generated so far.
   *
   * The analysis is produced by `ContentImportService`, so valid / duplicate / existing-conflict /
   * invalid classification is identical to a file import and still performs NO write.
   */
  async analyzeJob(input: { jobId: string; actorUserId: string }): Promise<JobAnalysisResult> {
    const job = await this.load(input.jobId, input.actorUserId);
    if (!job) return { status: 'not_found' };
    const records = await this.loadRecords(input.jobId);
    const analyzed = await this.importService.analyzeRecords({
      packId: job.plan.packId,
      records,
      // Generated rows are 1-based: there is no header row to offset past.
      firstRowNumber: 1,
      // The pack may not exist yet; the approved plan's level is the authority until it does.
      fallbackCefr: job.plan.cefr,
      filename: `${job.plan.packId}.ai`,
    });
    if (analyzed.status !== 'ok') return { status: 'not_found' };
    const quality = buildQualityReport(
      records as GeneratedRow[],
      analyzed.analysis.rows.map((row) => row.classification),
      job.plan.cardCount,
    );
    return {
      status: 'ok',
      job,
      analysis: analyzed.analysis,
      quality,
      reviews: reviewSummaryByRow(records as GeneratedRow[]),
    };
  }

  /**
   * Accepts EXPLICITLY selected generated rows into canonical draft content.
   *
   * This is the only method here that writes canonical data. It creates the pack if needed and
   * then delegates every card to the M1.3 apply path, which uses M1.2's `createCard`: canonical
   * validation, draft status, audit logging and per-row idempotency all stay in one place.
   */
  async accept(input: {
    jobId: string;
    actorUserId: string;
    expectedFingerprint: string;
    selectedRows: readonly number[];
    acceptKey: string;
  }): Promise<AcceptResult> {
    // Replay first. Once acceptance has happened the created cards are canonical, so a fresh
    // analysis would reclassify them as existing-card conflicts and the fingerprint would no
    // longer match — a retried accept would look like a failure even though it succeeded. The
    // recorded outcome is therefore returned verbatim for the same accept key.
    const replayed = await this.pool.query(
      `SELECT pack_id, accepted_card_count FROM ai_generation_jobs
        WHERE id = $1 AND actor_user_id = $2 AND status = 'accepted' AND accepted_import_key = $3`,
      [input.jobId, input.actorUserId, input.acceptKey],
    );
    if (replayed.rows.length > 0) {
      const existing = await this.load(input.jobId, input.actorUserId);
      return {
        status: 'ok',
        job: existing!,
        created: Number(replayed.rows[0]!.accepted_card_count ?? 0),
        skipped: 0,
        packId: String(replayed.rows[0]!.pack_id),
      };
    }

    const analyzed = await this.analyzeJob(input);
    if (analyzed.status === 'not_found') return { status: 'not_found' };
    const { job, analysis } = analyzed;
    if (job.status !== 'generated') {
      return { status: 'conflict', message: 'این تولید آمادهٔ پذیرش نیست.' };
    }
    if (input.selectedRows.length === 0) {
      return { status: 'stale', message: 'هیچ کارتی برای پذیرش انتخاب نشده است.' };
    }
    const records = await this.loadRecords(input.jobId);
    const selected = new Set(input.selectedRows);
    const nonReady = analysis.rows.find((row) => {
      if (!selected.has(row.rowNumber)) return false;
      const record = records[row.rowNumber - 1];
      return !record || !isReadyRow(record, row.classification);
    });
    if (nonReady) {
      return { status: 'stale', message: 'کارت دارای خطای حل‌نشده یا بررسی‌نشده قابل پذیرش نیست.' };
    }

    // The pack is canonical from the start: created through M1.2's store as a DRAFT pack, keyed by
    // the accept key so a retried acceptance reuses it instead of failing or duplicating.
    const pack = await this.writeStore.createPack({
      packId: job.plan.packId,
      displayName: job.plan.title,
      description: job.plan.description,
      targetCefr: job.plan.cefr,
      targetItemCount: job.plan.cardCount,
      isFree: job.plan.isFree,
      idempotencyKey: rowIdempotencyKey(input.acceptKey, `pack:${job.plan.packId}`),
      actorUserId: input.actorUserId,
    });
    if (pack.status === 'forbidden') return { status: 'forbidden' };
    if (pack.status === 'invalid') {
      return { status: 'stale', message: 'طرح بستهٔ معتبری نمی‌سازد.' };
    }
    // `conflict` here means the pack id already exists, which is fine: the cards below are still
    // classified against it, and an existing-card conflict stays a default skip.

    const applied = await this.importService.applyAnalysis(analysis, {
      packId: job.plan.packId,
      actorUserId: input.actorUserId,
      importKey: input.acceptKey,
      expectedFingerprint: input.expectedFingerprint,
      selectedNewRows: input.selectedRows,
      // M1.3 policy preserved verbatim: an existing canonical card is never touched by AI
      // acceptance. Updating one stays an explicit, separate import action.
      selectedConflictRows: [],
    });
    if (applied.status === 'forbidden') return { status: 'forbidden' };
    if (applied.status === 'not_found') return { status: 'not_found' };
    if (applied.status === 'stale') return { status: 'stale', message: applied.message };

    // Bind each accepted row's review to the draft version it became, in the same update that
    // records acceptance. The Admin review queue reads it from here, so the findings appear beside
    // exactly that version; a later human edit creates a new version that carries none of them.
    const versionByRow = new Map<number, string>();
    for (const outcome of applied.outcomes) {
      if (outcome.cardVersionId) versionByRow.set(outcome.rowNumber, outcome.cardVersionId);
    }
    const linked = records.map((record, index) => {
      const cardVersionId = versionByRow.get(index + 1);
      if (!cardVersionId || !record._review) return record;
      return { ...record, _review: { ...record._review, cardVersionId } };
    });
    await this.pool.query(
      `UPDATE ai_generation_jobs
          SET status = 'accepted', pack_id = $3, accepted_import_key = $4,
              accepted_card_count = $5, generated_rows = $6::jsonb, updated_at = now()
        WHERE id = $1 AND actor_user_id = $2`,
      [
        input.jobId,
        input.actorUserId,
        job.plan.packId,
        input.acceptKey,
        applied.created,
        JSON.stringify(linked),
      ],
    );
    const after = await this.load(input.jobId, input.actorUserId);
    return {
      status: 'ok',
      job: after ?? job,
      created: applied.created,
      skipped: applied.skipped,
      packId: job.plan.packId,
    };
  }

  private async loadRecords(jobId: string): Promise<GeneratedRow[]> {
    const result = await this.pool.query(
      'SELECT generated_rows FROM ai_generation_jobs WHERE id = $1',
      [jobId],
    );
    if (result.rows.length === 0) return [];
    const raw = result.rows[0]!.generated_rows;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? (parsed as GeneratedRow[]) : [];
  }

  private async loadLemmas(jobId: string): Promise<string[]> {
    const records = await this.loadRecords(jobId);
    return records.map((record) => record.lemma ?? '').filter(Boolean);
  }

  async load(jobId: string, actorUserId: string): Promise<JobView | undefined> {
    const result = await this.pool.query(
      `SELECT id, prompt, plan, plan_fingerprint, status, requested_count, batch_size,
              next_batch_index, batch_attempts, provider, model, reviewer_model, repair_model,
              error_code, error_message, pack_id, generated_rows,
              jsonb_array_length(generated_rows) AS generated_count
         FROM ai_generation_jobs
        WHERE id = $1 AND actor_user_id = $2`,
      [jobId, actorUserId],
    );
    if (result.rows.length === 0) return undefined;
    const row = result.rows[0]!;
    const planRaw = row.plan;
    const plan = (typeof planRaw === 'string' ? JSON.parse(planRaw) : planRaw) as GenerationPlan;
    const generated = Number(row.generated_count ?? 0);
    const batchSize = Number(row.batch_size);
    const errorCode = row.error_code ? String(row.error_code) : undefined;
    return {
      jobId: String(row.id),
      status: String(row.status) as JobStatus,
      prompt: String(row.prompt),
      plan,
      planFingerprint: String(row.plan_fingerprint),
      provider: row.provider ? String(row.provider) : undefined,
      model: row.model ? String(row.model) : undefined,
      reviewerModel: row.reviewer_model ? String(row.reviewer_model) : undefined,
      repairModel: row.repair_model ? String(row.repair_model) : undefined,
      progress: {
        requested: Number(row.requested_count),
        generated,
        batchSize,
        batchesDone: Number(row.next_batch_index),
        batchesTotal: Math.max(1, Math.ceil(Number(row.requested_count) / batchSize)),
        attemptsOnCurrentBatch: Number(row.batch_attempts),
      },
      error: errorCode ? { code: errorCode, message: String(row.error_message ?? '') } : undefined,
      packId: row.pack_id ? String(row.pack_id) : undefined,
    };
  }
}
