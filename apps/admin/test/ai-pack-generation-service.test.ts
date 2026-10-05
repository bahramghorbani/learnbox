import { describe, expect, it, vi } from 'vitest';

import {
  AiProviderError,
  DEFAULT_AI_GENERATION_LIMITS,
  readAiGenerationConfig,
  type AiGenerationLimits,
  type AiTextProvider,
} from '../lib/server/ai-generation-provider';
import {
  AiPackGenerationService,
  normalizeModelSelection,
} from '../lib/server/ai-pack-generation-service';
import { IMPORT_COLUMNS } from '../lib/server/content-import-contract';
import { ContentImportService } from '../lib/server/content-import-service';
import {
  deriveContentId,
  type CardWriteResult,
} from '../lib/server/postgres-content-packs-write-store';

/** Canonical id a generated card would claim. Cards carry the contract's example CEFR (A1). */
function generatedContentId(lemma: string): string {
  return deriveContentId('studium-b1', 'A1', lemma);
}

/**
 * Phase 1 / M1.4 — AI pack generation.
 *
 * The provider is always a stub here: these tests assert LearnBox's own guarantees, which must
 * hold whatever the model returns. The guarantees under test are the ones a real provider cannot
 * be trusted to respect — nothing canonical before acceptance, canonical validation on every
 * generated card, duplicates and conflicts surfaced, draft-only writes, and idempotent retries.
 */

const ACTOR = '55555555-5555-4555-8555-555555555555';
const JOB_ID_PATTERN = /^[0-9a-f-]{36}$/;

/** A fully-populated generated card, from the canonical contract's own examples. */
function card(overrides: Record<string, string> = {}): Record<string, string> {
  const base: Record<string, string> = {};
  for (const column of IMPORT_COLUMNS) base[column.key] = column.example;
  return { ...base, ...overrides };
}

function planReply(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    packId: 'studium-b1',
    title: 'بستهٔ تحصیل در آلمان',
    description: 'واژگان ضروری برای دانشجویان',
    audience: 'دانشجویان متقاضی تحصیل در آلمان',
    cefr: 'B1',
    cardCount: 4,
    topics: ['دانشگاه', 'مسکن', 'اداری'],
    strategy: 'تقسیم بر اساس موضوع',
    scope: 'فقط واژگان متنی',
    ...overrides,
  });
}

/**
 * In-memory stand-in for the `ai_generation_jobs` table.
 *
 * It interprets only the statements the service issues, including the single-flight lease and the
 * jsonb append, so the checkpoint and concurrency behaviour is exercised rather than mocked away.
 */
function makeJobPool(options: { existingContentIds?: string[] } = {}) {
  type Job = {
    id: string;
    actor_user_id: string;
    prompt: string;
    plan: string;
    plan_fingerprint: string;
    status: string;
    requested_count: number;
    batch_size: number;
    next_batch_index: number;
    batch_attempts: number;
    generated_rows: unknown[];
    provider: string | null;
    model: string | null;
    error_code: string | null;
    error_message: string | null;
    lease_until: number | null;
    pack_id: string | null;
    accepted_import_key: string | null;
    accepted_card_count: number | null;
  };
  const jobs = new Map<string, Job>();
  let now = Date.now();

  const pool = {
    // The clock is explicit so a lease can be expired deterministically.
    advance(ms: number) {
      now += ms;
    },
    jobs,
    query: vi.fn(async (sql: string, parameters: readonly unknown[] = []) => {
      if (/INSERT INTO ai_generation_jobs/.test(sql)) {
        const [id, actor, prompt, plan, fingerprint, requested, batchSize, provider, model] =
          parameters as string[];
        jobs.set(id, {
          id,
          actor_user_id: actor,
          prompt,
          plan,
          plan_fingerprint: fingerprint,
          status: 'planned',
          requested_count: Number(requested),
          batch_size: Number(batchSize),
          next_batch_index: 0,
          batch_attempts: 0,
          generated_rows: [],
          provider,
          model,
          error_code: null,
          error_message: null,
          lease_until: null,
          pack_id: null,
          accepted_import_key: null,
          accepted_card_count: null,
        });
        return { rows: [] };
      }

      if (/SET status = 'generating'/.test(sql)) {
        const [id, actor] = parameters as string[];
        const job = jobs.get(id);
        if (job && job.actor_user_id === actor && job.status === 'planned') {
          job.status = 'generating';
        }
        return { rows: [] };
      }

      if (/SET lease_until = now\(\)/.test(sql)) {
        const [id, actor, seconds] = parameters as string[];
        const job = jobs.get(id);
        if (
          !job ||
          job.actor_user_id !== actor ||
          job.status !== 'generating' ||
          (job.lease_until !== null && job.lease_until >= now)
        ) {
          return { rows: [] };
        }
        job.lease_until = now + Number(seconds) * 1000;
        return { rows: [{ id }] };
      }

      if (/generated_rows \|\| \$3::jsonb/.test(sql)) {
        const [id, actor, appended] = parameters as string[];
        const job = jobs.get(id);
        if (!job || job.actor_user_id !== actor) return { rows: [] };
        job.generated_rows = [...job.generated_rows, ...(JSON.parse(appended) as unknown[])];
        job.next_batch_index += 1;
        job.batch_attempts = 0;
        job.error_code = null;
        job.error_message = null;
        job.lease_until = null;
        return { rows: [] };
      }

      if (/SET batch_attempts = batch_attempts \+ 1/.test(sql)) {
        const [id, actor, code, message, maxAttempts] = parameters as string[];
        const job = jobs.get(id);
        if (!job || job.actor_user_id !== actor) return { rows: [] };
        job.batch_attempts += 1;
        job.error_code = code;
        job.error_message = message;
        job.lease_until = null;
        if (job.batch_attempts >= Number(maxAttempts)) job.status = 'failed';
        return { rows: [{ status: job.status }] };
      }

      if (/SET status = 'generated'/.test(sql)) {
        const [id] = parameters as string[];
        const job = jobs.get(id);
        if (job && job.status === 'generating') {
          job.status = 'generated';
          job.lease_until = null;
        }
        return { rows: [] };
      }

      if (/SET status = 'accepted'/.test(sql)) {
        const [id, actor, packId, key, count] = parameters as string[];
        const job = jobs.get(id);
        if (job && job.actor_user_id === actor) {
          job.status = 'accepted';
          job.pack_id = packId;
          job.accepted_import_key = key;
          job.accepted_card_count = Number(count);
        }
        return { rows: [] };
      }

      // Acceptance replay lookup. Must precede the generic job SELECT below, which ignores status.
      if (/accepted_card_count FROM ai_generation_jobs/.test(sql)) {
        const [id, actor, key] = parameters as string[];
        const job = jobs.get(id);
        if (!job || job.actor_user_id !== actor) return { rows: [] };
        if (job.status !== 'accepted' || job.accepted_import_key !== key) return { rows: [] };
        return {
          rows: [{ pack_id: job.pack_id, accepted_card_count: job.accepted_card_count }],
        };
      }

      if (/SELECT generated_rows FROM ai_generation_jobs/.test(sql)) {
        const job = jobs.get((parameters as string[])[0]!);
        return { rows: job ? [{ generated_rows: job.generated_rows }] : [] };
      }

      if (/FROM ai_generation_jobs/.test(sql)) {
        const [id, actor] = parameters as string[];
        const job = jobs.get(id);
        if (!job || job.actor_user_id !== actor) return { rows: [] };
        return { rows: [{ ...job, generated_count: job.generated_rows.length }] };
      }

      // Canonical content queries, reached through the import service.
      if (/FROM packs/.test(sql)) {
        return { rows: [] };
      }
      if (/FROM cards WHERE content_id/.test(sql)) {
        return {
          rows: (options.existingContentIds ?? []).map((contentId, index) => ({
            content_id: contentId,
            id: `44444444-4444-4444-8444-${String(index + 1).padStart(12, '4')}`,
          })),
        };
      }
      return { rows: [] };
    }),
  };
  return pool;
}

function makeHarness(
  options: {
    replies?: string[];
    complete?: AiTextProvider['complete'];
    existingContentIds?: string[];
    limits?: Partial<AiGenerationLimits>;
    createPackStatus?: 'applied' | 'conflict' | 'invalid' | 'forbidden';
  } = {},
) {
  const replies = [...(options.replies ?? [])];
  const completeCalls: Array<{ system: string; user: string; model?: string }> = [];
  const provider: AiTextProvider = {
    provider: 'stub',
    model: 'stub-model-1',
    listTextModels: async () => ['claude-sonnet-4-5', 'claude-haiku-4-5'],
    complete:
      options.complete ??
      (async (request) => {
        completeCalls.push({ system: request.system, user: request.user, model: request.model });
        const next = replies.shift();
        if (next === undefined) {
          throw new AiProviderError('provider_unavailable', 'no more stub replies');
        }
        return next;
      }),
  };

  const pool = makeJobPool({ existingContentIds: options.existingContentIds });
  let created = 0;
  const writeStore = {
    createCard: vi.fn<(input: Record<string, unknown>) => Promise<CardWriteResult>>(async () => {
      created += 1;
      return {
        status: 'applied',
        cardId: `00000000-0000-4000-8000-${String(created).padStart(12, '0')}`,
        cardVersionId: `00000000-0000-4000-8000-${String(created + 500).padStart(12, '0')}`,
        version: 1,
      };
    }),
    editCard: vi.fn(async (): Promise<CardWriteResult> => {
      throw new Error('AI acceptance must never edit an existing card');
    }),
    createPack: vi.fn<(input: Record<string, unknown>) => Promise<{ status: string }>>(
      async () => ({
        status: options.createPackStatus ?? 'applied',
      }),
    ),
  };

  const importService = new ContentImportService(
    pool as never,
    writeStore as unknown as ConstructorParameters<typeof ContentImportService>[1],
  );
  const service = new AiPackGenerationService(
    pool,
    provider,
    { ...DEFAULT_AI_GENERATION_LIMITS, ...options.limits },
    importService,
    writeStore as never,
  );
  return { service, pool, writeStore, provider, completeCalls };
}

/** Walks a job from prompt to `generated`, returning the job id. */
async function generate(
  harness: ReturnType<typeof makeHarness>,
  options: { batches?: number } = {},
): Promise<string> {
  const planned = await harness.service.plan({ prompt: 'یک بستهٔ B1 بساز', actorUserId: ACTOR });
  if (planned.status !== 'ok') throw new Error(`plan failed: ${planned.status}`);
  const approved = await harness.service.approvePlan({
    jobId: planned.job.jobId,
    actorUserId: ACTOR,
    expectedPlanFingerprint: planned.job.planFingerprint,
  });
  if (approved.status !== 'ok') throw new Error('approve failed');
  for (let index = 0; index < (options.batches ?? 1); index += 1) {
    await harness.service.runNextBatch({ jobId: planned.job.jobId, actorUserId: ACTOR });
  }
  return planned.job.jobId;
}

describe('readAiGenerationConfig', () => {
  it('is off by default', () => {
    expect(readAiGenerationConfig({})).toEqual({ enabled: false, reason: 'disabled' });
  });

  it('reports a missing credential instead of enabling a fallback provider', () => {
    const config = readAiGenerationConfig({ LEARNBOX_ADMIN_CONTENT_AI_ENABLED: 'true' });
    // The feature stays on so already-generated jobs remain inspectable and acceptable, but no
    // provider is supplied, so nothing can be generated and nothing is faked.
    expect(config.enabled).toBe(true);
    if (!config.enabled) return;
    expect(config.provider).toBeUndefined();
    expect(config.reason).toBe('provider_not_configured');
  });

  it('builds no provider object at all without a credential', () => {
    const config = readAiGenerationConfig({ LEARNBOX_ADMIN_CONTENT_AI_ENABLED: 'true' });
    if (!config.enabled) throw new Error('feature expected to stay enabled');
    expect(config.provider).toBeUndefined();
    expect(JSON.stringify(config)).not.toContain('avalai');
  });

  it('enables the provider when flag and credential are both present', () => {
    const config = readAiGenerationConfig({
      LEARNBOX_ADMIN_CONTENT_AI_ENABLED: 'true',
      LEARNBOX_AI_API_KEY: 'test-key-not-real',
      LEARNBOX_AI_MODEL: 'claude-test',
    });
    expect(config.enabled).toBe(true);
    if (!config.enabled || !config.provider) throw new Error('provider expected');
    // Attribution is the serving host, so the audit trail names who actually answered.
    expect(config.provider.provider).toBe('avalai.ir');
    expect(config.provider.model).toBe('claude-test');
  });

  it('attributes the provider to whichever host is configured', () => {
    const config = readAiGenerationConfig({
      LEARNBOX_ADMIN_CONTENT_AI_ENABLED: 'true',
      LEARNBOX_AI_API_KEY: 'test-key-not-real',
      LEARNBOX_AI_BASE_URL: 'https://api.anthropic.com',
    });
    if (!config.enabled || !config.provider) throw new Error('provider expected');
    expect(config.provider.provider).toBe('anthropic.com');
  });

  it('never exposes the credential through the provider object', () => {
    const config = readAiGenerationConfig({
      LEARNBOX_ADMIN_CONTENT_AI_ENABLED: 'true',
      LEARNBOX_AI_API_KEY: 'super-secret-value',
    });
    expect(config.enabled).toBe(true);
    if (!config.enabled || !config.provider) throw new Error('provider expected');
    // Covers both own and inherited enumerable state, which is what a log or JSON body would see.
    expect(JSON.stringify(config.provider)).not.toContain('super-secret-value');
    expect(Object.values(config.provider as unknown as Record<string, unknown>)).not.toContain(
      'super-secret-value',
    );
  });

  it('clamps the card ceiling to the built-in maximum', () => {
    const config = readAiGenerationConfig({
      LEARNBOX_ADMIN_CONTENT_AI_ENABLED: 'true',
      LEARNBOX_AI_API_KEY: 'k',
      LEARNBOX_AI_MAX_CARDS: '100000',
    });
    expect(config.enabled).toBe(true);
    if (!config.enabled) return;
    expect(config.limits.maxCards).toBe(DEFAULT_AI_GENERATION_LIMITS.maxCards);
  });
});

describe('normalizeModelSelection', () => {
  it('accepts catalogue-shaped Claude ids', () => {
    expect(normalizeModelSelection('claude-sonnet-4-5')).toBe('claude-sonnet-4-5');
    expect(normalizeModelSelection('  claude-haiku-4-5  ')).toBe('claude-haiku-4-5');
  });

  it('rejects anything that is not a plain Claude model id', () => {
    // An Admin-supplied value must never be able to redirect the call or inject characters.
    for (const bad of [
      'gpt-4o',
      'claude sonnet',
      'claude/../../etc/passwd',
      'https://evil.example/claude',
      'claude\n\rinjected',
      '',
      '   ',
      undefined,
      null,
      42,
      { id: 'claude-sonnet-4-5' },
      `claude-${'x'.repeat(200)}`,
    ]) {
      expect(normalizeModelSelection(bad as unknown)).toBeUndefined();
    }
  });
});

describe('AiPackGenerationService without a provider', () => {
  function providerless() {
    const pool = makeJobPool();
    const writeStore = {
      createCard: vi.fn(),
      editCard: vi.fn(),
      createPack: vi.fn(),
    };
    const importService = new ContentImportService(
      pool as never,
      writeStore as unknown as ConstructorParameters<typeof ContentImportService>[1],
    );
    return new AiPackGenerationService(
      pool,
      undefined,
      DEFAULT_AI_GENERATION_LIMITS,
      importService,
      writeStore as never,
    );
  }

  it('refuses to plan', async () => {
    const result = await providerless().plan({ prompt: 'بساز', actorUserId: ACTOR });
    expect(result.status).toBe('provider_not_configured');
  });

  it('refuses to generate without leaving a job leased', async () => {
    const result = await providerless().runNextBatch({
      jobId: '33333333-3333-4333-8333-333333333333',
      actorUserId: ACTOR,
    });
    expect(result.status).toBe('provider_not_configured');
  });
});

describe('AiPackGenerationService.plan', () => {
  it('turns a natural-language prompt into a structured plan', async () => {
    const harness = makeHarness({ replies: [planReply()] });
    const result = await harness.service.plan({
      prompt: 'یک بستهٔ ۵۰۰ کلمه‌ای برای دانشجویان، سطح B1 بساز',
      actorUserId: ACTOR,
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.job.jobId).toMatch(JOB_ID_PATTERN);
    expect(result.job.status).toBe('planned');
    expect(result.job.plan.title).toBe('بستهٔ تحصیل در آلمان');
    expect(result.job.plan.cefr).toBe('B1');
    expect(result.job.plan.topics).toEqual(['دانشگاه', 'مسکن', 'اداری']);
    // The plan reports the canonical field set, not a model-chosen one.
    expect(result.job.plan.fields).toEqual(IMPORT_COLUMNS.map((column) => column.key));
  });

  it('writes no canonical content while planning', async () => {
    const harness = makeHarness({ replies: [planReply()] });
    await harness.service.plan({ prompt: 'بساز', actorUserId: ACTOR });
    expect(harness.writeStore.createCard).not.toHaveBeenCalled();
    expect(harness.writeStore.createPack).not.toHaveBeenCalled();
  });

  it('clamps a request above the server ceiling', async () => {
    const harness = makeHarness({
      replies: [planReply({ cardCount: 5000 })],
      limits: { maxCards: 50 },
    });
    const result = await harness.service.plan({ prompt: '۵۰۰۰ کلمه', actorUserId: ACTOR });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.job.plan.requestedCount).toBe(5000);
    expect(result.job.plan.cardCount).toBe(50);
  });

  it('rejects an oversized prompt without calling the provider', async () => {
    const harness = makeHarness({ limits: { maxPromptChars: 10 } });
    const result = await harness.service.plan({ prompt: 'x'.repeat(50), actorUserId: ACTOR });
    expect(result.status).toBe('invalid');
    expect(harness.completeCalls).toHaveLength(0);
  });

  it('rejects an empty prompt without calling the provider', async () => {
    const harness = makeHarness();
    const result = await harness.service.plan({ prompt: '   ', actorUserId: ACTOR });
    expect(result.status).toBe('invalid');
    expect(harness.completeCalls).toHaveLength(0);
  });

  it('reports a provider failure honestly', async () => {
    const harness = makeHarness({
      complete: async () => {
        throw new AiProviderError('provider_timeout', 'timed out');
      },
    });
    const result = await harness.service.plan({ prompt: 'بساز', actorUserId: ACTOR });
    expect(result.status).toBe('provider_error');
    if (result.status !== 'provider_error') return;
    expect(result.code).toBe('provider_timeout');
  });

  it('rejects an unusable plan rather than inventing defaults', async () => {
    for (const bad of [
      planReply({ cefr: 'Z9' }),
      planReply({ cardCount: 'many' }),
      planReply({ title: '' }),
      'not json at all',
    ]) {
      const harness = makeHarness({ replies: [bad] });
      const result = await harness.service.plan({ prompt: 'بساز', actorUserId: ACTOR });
      expect(result.status).toBe('provider_error');
    }
  });

  it('accepts a plan wrapped in a markdown code fence', async () => {
    const harness = makeHarness({ replies: ['```json\n' + planReply() + '\n```'] });
    const result = await harness.service.plan({ prompt: 'بساز', actorUserId: ACTOR });
    expect(result.status).toBe('ok');
  });
});

describe('AiPackGenerationService plan approval gate', () => {
  it('does not generate before the plan is approved', async () => {
    const harness = makeHarness({ replies: [planReply()] });
    const planned = await harness.service.plan({ prompt: 'بساز', actorUserId: ACTOR });
    if (planned.status !== 'ok') throw new Error('plan failed');
    const run = await harness.service.runNextBatch({
      jobId: planned.job.jobId,
      actorUserId: ACTOR,
    });
    expect(run.status).toBe('conflict');
    // Exactly one provider call: the plan. No card generation happened.
    expect(harness.completeCalls).toHaveLength(1);
  });

  it('refuses approval when the plan fingerprint does not match', async () => {
    const harness = makeHarness({ replies: [planReply()] });
    const planned = await harness.service.plan({ prompt: 'بساز', actorUserId: ACTOR });
    if (planned.status !== 'ok') throw new Error('plan failed');
    const approved = await harness.service.approvePlan({
      jobId: planned.job.jobId,
      actorUserId: ACTOR,
      expectedPlanFingerprint: 'f'.repeat(64),
    });
    expect(approved.status).toBe('stale');
  });

  it('refuses a second approval of the same plan', async () => {
    const harness = makeHarness({ replies: [planReply()] });
    const planned = await harness.service.plan({ prompt: 'بساز', actorUserId: ACTOR });
    if (planned.status !== 'ok') throw new Error('plan failed');
    const first = await harness.service.approvePlan({
      jobId: planned.job.jobId,
      actorUserId: ACTOR,
      expectedPlanFingerprint: planned.job.planFingerprint,
    });
    expect(first.status).toBe('ok');
    const second = await harness.service.approvePlan({
      jobId: planned.job.jobId,
      actorUserId: ACTOR,
      expectedPlanFingerprint: planned.job.planFingerprint,
    });
    expect(second.status).toBe('conflict');
  });

  it('does not leak another owner\u2019s job', async () => {
    const harness = makeHarness({ replies: [planReply()] });
    const planned = await harness.service.plan({ prompt: 'بساز', actorUserId: ACTOR });
    if (planned.status !== 'ok') throw new Error('plan failed');
    const result = await harness.service.analyzeJob({
      jobId: planned.job.jobId,
      actorUserId: '66666666-6666-4666-8666-666666666666',
    });
    expect(result.status).toBe('not_found');
  });
});

describe('AiPackGenerationService generation job', () => {
  it('generates in batches, checkpointing real progress', async () => {
    const harness = makeHarness({
      replies: [
        planReply({ cardCount: 4 }),
        JSON.stringify({ cards: [card({ lemma: 'Haus' }), card({ lemma: 'Buch' })] }),
        JSON.stringify({ cards: [card({ lemma: 'Stuhl' }), card({ lemma: 'Lampe' })] }),
      ],
      limits: { batchSize: 2 },
    });
    const planned = await harness.service.plan({ prompt: 'بساز', actorUserId: ACTOR });
    if (planned.status !== 'ok') throw new Error('plan failed');
    await harness.service.approvePlan({
      jobId: planned.job.jobId,
      actorUserId: ACTOR,
      expectedPlanFingerprint: planned.job.planFingerprint,
    });

    const first = await harness.service.runNextBatch({
      jobId: planned.job.jobId,
      actorUserId: ACTOR,
    });
    expect(first.status).toBe('ok');
    if (first.status !== 'ok') return;
    // Progress is the count actually returned, not an estimate.
    expect(first.job.progress.generated).toBe(2);
    expect(first.job.progress.batchesDone).toBe(1);
    expect(first.job.status).toBe('generating');

    const second = await harness.service.runNextBatch({
      jobId: planned.job.jobId,
      actorUserId: ACTOR,
    });
    expect(second.status).toBe('ok');
    if (second.status !== 'ok') return;
    expect(second.job.progress.generated).toBe(4);
    expect(second.job.status).toBe('generated');
  });

  it('writes nothing canonical during generation', async () => {
    const harness = makeHarness({
      replies: [planReply({ cardCount: 2 }), JSON.stringify({ cards: [card(), card()] })],
      limits: { batchSize: 2 },
    });
    await generate(harness);
    expect(harness.writeStore.createCard).not.toHaveBeenCalled();
    expect(harness.writeStore.createPack).not.toHaveBeenCalled();
  });

  it('tells the model which lemmas are already taken', async () => {
    const harness = makeHarness({
      replies: [
        planReply({ cardCount: 4 }),
        JSON.stringify({ cards: [card({ lemma: 'Haus' }), card({ lemma: 'Buch' })] }),
        JSON.stringify({ cards: [card({ lemma: 'Stuhl' }), card({ lemma: 'Lampe' })] }),
      ],
      limits: { batchSize: 2 },
    });
    await generate(harness, { batches: 2 });
    const secondBatchPrompt = harness.completeCalls[2]!.user;
    expect(secondBatchPrompt).toContain('Haus');
    expect(secondBatchPrompt).toContain('Buch');
  });

  it('is single-flight per job while a batch is in progress', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let call = 0;
    const harness = makeHarness({
      limits: { batchSize: 2 },
      complete: async () => {
        call += 1;
        if (call === 1) return planReply({ cardCount: 4 });
        await gate;
        return JSON.stringify({ cards: [card(), card()] });
      },
    });
    const planned = await harness.service.plan({ prompt: 'بساز', actorUserId: ACTOR });
    if (planned.status !== 'ok') throw new Error('plan failed');
    await harness.service.approvePlan({
      jobId: planned.job.jobId,
      actorUserId: ACTOR,
      expectedPlanFingerprint: planned.job.planFingerprint,
    });

    const inFlight = harness.service.runNextBatch({
      jobId: planned.job.jobId,
      actorUserId: ACTOR,
    });
    // A second run while the lease is held must be refused, not fan out into another call.
    const concurrent = await harness.service.runNextBatch({
      jobId: planned.job.jobId,
      actorUserId: ACTOR,
    });
    expect(concurrent.status).toBe('conflict');
    release?.();
    await inFlight;
    expect(call).toBe(2);
  });

  it('keeps earlier batches when a later batch fails, and resumes at the failed batch', async () => {
    let call = 0;
    const harness = makeHarness({
      limits: { batchSize: 2, maxBatchAttempts: 3 },
      complete: async () => {
        call += 1;
        if (call === 1) return planReply({ cardCount: 4 });
        if (call === 2) {
          return JSON.stringify({ cards: [card({ lemma: 'Haus' }), card({ lemma: 'Buch' })] });
        }
        if (call === 3) throw new AiProviderError('provider_timeout', 'timed out');
        return JSON.stringify({ cards: [card({ lemma: 'Stuhl' }), card({ lemma: 'Lampe' })] });
      },
    });
    // Two batches: the first succeeds, the second fails.
    const jobId = await generate(harness, { batches: 2 });

    const afterFailure = await harness.service.analyzeJob({ jobId, actorUserId: ACTOR });
    expect(afterFailure.status).toBe('ok');
    if (afterFailure.status !== 'ok') return;
    // The first batch survived the second batch's failure.
    expect(afterFailure.job.progress.generated).toBe(2);
    expect(afterFailure.job.progress.batchesDone).toBe(1);
    expect(afterFailure.job.progress.attemptsOnCurrentBatch).toBe(1);
    expect(afterFailure.job.error?.code).toBe('provider_timeout');

    const retried = await harness.service.runNextBatch({ jobId, actorUserId: ACTOR });
    expect(retried.status).toBe('ok');
    if (retried.status !== 'ok') return;
    // The retry appended the missing batch instead of skipping it or duplicating batch one.
    expect(retried.job.progress.generated).toBe(4);
    expect(retried.job.status).toBe('generated');
  });

  it('fails the job honestly once retries are exhausted', async () => {
    const harness = makeHarness({
      limits: { batchSize: 2, maxBatchAttempts: 2 },
      replies: [planReply({ cardCount: 2 })],
    });
    const jobId = await generate(harness, { batches: 2 });
    const status = await harness.service.analyzeJob({ jobId, actorUserId: ACTOR });
    expect(status.status).toBe('ok');
    if (status.status !== 'ok') return;
    expect(status.job.status).toBe('failed');
    expect(status.job.error?.code).toBe('provider_unavailable');
    expect(harness.writeStore.createCard).not.toHaveBeenCalled();
  });

  it('treats an unparseable batch as a batch failure, not as cards', async () => {
    const harness = makeHarness({
      limits: { batchSize: 2 },
      replies: [planReply({ cardCount: 2 }), 'I cannot help with that.'],
    });
    const jobId = await generate(harness);
    const status = await harness.service.analyzeJob({ jobId, actorUserId: ACTOR });
    expect(status.status).toBe('ok');
    if (status.status !== 'ok') return;
    expect(status.job.progress.generated).toBe(0);
    expect(status.job.error?.code).toBe('provider_empty_response');
  });

  it('never stores more cards than the plan approved', async () => {
    const harness = makeHarness({
      limits: { batchSize: 2 },
      replies: [
        planReply({ cardCount: 2 }),
        // A model that over-delivers must not inflate the job past the approved count.
        JSON.stringify({
          cards: [card({ lemma: 'A' }), card({ lemma: 'B' }), card({ lemma: 'C' })],
        }),
      ],
    });
    const jobId = await generate(harness);
    const status = await harness.service.analyzeJob({ jobId, actorUserId: ACTOR });
    expect(status.status).toBe('ok');
    if (status.status !== 'ok') return;
    expect(status.job.progress.generated).toBe(2);
  });
});

describe('AiPackGenerationService generated preview', () => {
  it('classifies valid, duplicate, conflicting and invalid generated cards', async () => {
    const harness = makeHarness({
      limits: { batchSize: 4 },
      // This lemma already exists as a canonical card.
      existingContentIds: [generatedContentId('Tisch')],
      replies: [
        planReply({ cardCount: 4 }),
        JSON.stringify({
          cards: [
            card({ lemma: 'Haus' }),
            card({ lemma: 'Haus' }),
            card({ lemma: 'Tisch' }),
            card({ lemma: 'Buch', persian_meanings: '' }),
          ],
        }),
      ],
    });
    const jobId = await generate(harness);
    const result = await harness.service.analyzeJob({ jobId, actorUserId: ACTOR });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    expect(result.analysis.counts.new).toBe(1);
    expect(result.analysis.counts.duplicate_in_file).toBe(1);
    expect(result.analysis.counts.existing).toBe(1);
    // A generated card missing a canonical required field is invalid, never silently accepted.
    expect(result.analysis.counts.invalid).toBe(1);
    expect(harness.writeStore.createCard).not.toHaveBeenCalled();
  });

  it('performs no write while previewing', async () => {
    const harness = makeHarness({
      limits: { batchSize: 2 },
      replies: [planReply({ cardCount: 2 }), JSON.stringify({ cards: [card(), card()] })],
    });
    const jobId = await generate(harness);
    await harness.service.analyzeJob({ jobId, actorUserId: ACTOR });
    expect(harness.writeStore.createCard).not.toHaveBeenCalled();
    expect(harness.writeStore.createPack).not.toHaveBeenCalled();
  });
});

describe('AiPackGenerationService acceptance', () => {
  async function readyHarness(options: { existingContentIds?: string[] } = {}) {
    const harness = makeHarness({
      limits: { batchSize: 3 },
      existingContentIds: options.existingContentIds,
      replies: [
        planReply({ cardCount: 3 }),
        JSON.stringify({
          cards: [card({ lemma: 'Haus' }), card({ lemma: 'Buch' }), card({ lemma: 'Stuhl' })],
        }),
      ],
    });
    const jobId = await generate(harness);
    const analyzed = await harness.service.analyzeJob({ jobId, actorUserId: ACTOR });
    if (analyzed.status !== 'ok') throw new Error('analysis failed');
    return { harness, jobId, analysis: analyzed.analysis };
  }

  it('creates canonical draft cards only for explicitly selected rows', async () => {
    const { harness, jobId, analysis } = await readyHarness();
    const selected = analysis.rows
      .filter((row) => row.classification === 'new')
      .slice(0, 2)
      .map((row) => row.rowNumber);

    const result = await harness.service.accept({
      jobId,
      actorUserId: ACTOR,
      expectedFingerprint: analysis.importableFingerprint,
      selectedRows: selected,
      acceptKey: '77777777-7777-4777-8777-777777777777',
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.created).toBe(2);
    // The third valid card was left unselected and therefore never created.
    expect(harness.writeStore.createCard).toHaveBeenCalledTimes(2);
    expect(harness.writeStore.createPack).toHaveBeenCalledTimes(1);
    expect(harness.writeStore.editCard).not.toHaveBeenCalled();
  });

  it('creates the pack as a canonical draft through the M1.2 write store', async () => {
    const { harness, jobId, analysis } = await readyHarness();
    const selected = analysis.rows
      .filter((row) => row.classification === 'new')
      .map((row) => row.rowNumber);
    await harness.service.accept({
      jobId,
      actorUserId: ACTOR,
      expectedFingerprint: analysis.importableFingerprint,
      selectedRows: selected,
      acceptKey: '77777777-7777-4777-8777-777777777777',
    });
    const packInput = harness.writeStore.createPack.mock.calls[0]![0] as Record<string, unknown>;
    // The write store rejects a non-UUID idempotency key by throwing, which a mocked store cannot
    // reveal; assert the shape here so the real store is never handed a raw digest.
    expect(String(packInput.idempotencyKey)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(packInput.packId).toBe('studium-b1');
    expect(packInput.targetCefr).toBe('B1');
    expect(packInput.actorUserId).toBe(ACTOR);
    // No status is passed: the write store decides, and it only ever creates drafts.
    expect(packInput).not.toHaveProperty('status');
  });

  it('never passes a status or version, so AI cannot publish', async () => {
    const { harness, jobId, analysis } = await readyHarness();
    const selected = analysis.rows
      .filter((row) => row.classification === 'new')
      .map((row) => row.rowNumber);
    await harness.service.accept({
      jobId,
      actorUserId: ACTOR,
      expectedFingerprint: analysis.importableFingerprint,
      selectedRows: selected,
      acceptKey: '77777777-7777-4777-8777-777777777777',
    });
    for (const call of harness.writeStore.createCard.mock.calls) {
      const input = call[0] as Record<string, unknown>;
      expect(input).not.toHaveProperty('status');
      expect(input).not.toHaveProperty('version');
      expect(input).not.toHaveProperty('publishedAt');
    }
  });

  it('is idempotent: the same accept key cannot create a second set of cards', async () => {
    const { harness, jobId, analysis } = await readyHarness();
    const selected = analysis.rows
      .filter((row) => row.classification === 'new')
      .map((row) => row.rowNumber);
    const payload = {
      jobId,
      actorUserId: ACTOR,
      expectedFingerprint: analysis.importableFingerprint,
      selectedRows: selected,
      acceptKey: '77777777-7777-4777-8777-777777777777',
    };
    const first = await harness.service.accept(payload);
    expect(first.status).toBe('ok');
    if (first.status !== 'ok') return;
    const createdFirst = harness.writeStore.createCard.mock.calls.length;

    const second = await harness.service.accept(payload);
    expect(second.status).toBe('ok');
    if (second.status !== 'ok') return;
    // A true replay: no further canonical write, and the recorded outcome is reported again
    // rather than re-derived (the accepted cards are now canonical and would reclassify).
    expect(harness.writeStore.createCard.mock.calls.length).toBe(createdFirst);
    expect(second.created).toBe(first.created);
    expect(second.packId).toBe(first.packId);
  });

  it('does not replay for a different accept key', async () => {
    const { harness, jobId, analysis } = await readyHarness();
    const selected = analysis.rows
      .filter((row) => row.classification === 'new')
      .map((row) => row.rowNumber);
    await harness.service.accept({
      jobId,
      actorUserId: ACTOR,
      expectedFingerprint: analysis.importableFingerprint,
      selectedRows: selected,
      acceptKey: '77777777-7777-4777-8777-777777777777',
    });
    const other = await harness.service.accept({
      jobId,
      actorUserId: ACTOR,
      expectedFingerprint: analysis.importableFingerprint,
      selectedRows: selected,
      acceptKey: '88888888-8888-4888-8888-888888888888',
    });
    // The job is already accepted, so a new key is refused rather than accepted a second time.
    expect(other.status).toBe('conflict');
  });

  it('refuses acceptance when the generated content changed after review', async () => {
    const { harness, jobId } = await readyHarness();
    const result = await harness.service.accept({
      jobId,
      actorUserId: ACTOR,
      expectedFingerprint: 'a'.repeat(64),
      selectedRows: [1],
      acceptKey: '77777777-7777-4777-8777-777777777777',
    });
    expect(result.status).toBe('stale');
    expect(harness.writeStore.createCard).not.toHaveBeenCalled();
  });

  it('refuses a row the server did not classify as acceptable', async () => {
    const { harness, jobId, analysis } = await readyHarness({
      existingContentIds: [generatedContentId('Haus')],
    });
    const conflicting = analysis.rows.find((row) => row.classification === 'existing');
    expect(conflicting).toBeDefined();
    const result = await harness.service.accept({
      jobId,
      actorUserId: ACTOR,
      expectedFingerprint: analysis.importableFingerprint,
      selectedRows: [conflicting!.rowNumber],
      acceptKey: '77777777-7777-4777-8777-777777777777',
    });
    expect(result.status).toBe('stale');
    expect(harness.writeStore.createCard).not.toHaveBeenCalled();
  });

  it('never modifies an existing canonical card (M1.3 default-skip preserved)', async () => {
    const { harness, jobId, analysis } = await readyHarness({
      existingContentIds: [generatedContentId('Haus')],
    });
    const selected = analysis.rows
      .filter((row) => row.classification === 'new')
      .map((row) => row.rowNumber);
    const result = await harness.service.accept({
      jobId,
      actorUserId: ACTOR,
      expectedFingerprint: analysis.importableFingerprint,
      selectedRows: selected,
      acceptKey: '77777777-7777-4777-8777-777777777777',
    });
    expect(result.status).toBe('ok');
    // The conflicting lemma was skipped: no edit, no new version on the published card.
    expect(harness.writeStore.editCard).not.toHaveBeenCalled();
  });

  it('refuses an empty selection', async () => {
    const { harness, jobId, analysis } = await readyHarness();
    const result = await harness.service.accept({
      jobId,
      actorUserId: ACTOR,
      expectedFingerprint: analysis.importableFingerprint,
      selectedRows: [],
      acceptKey: '77777777-7777-4777-8777-777777777777',
    });
    expect(result.status).toBe('stale');
    expect(harness.writeStore.createCard).not.toHaveBeenCalled();
  });

  it('refuses acceptance of a job that is still generating', async () => {
    const harness = makeHarness({
      limits: { batchSize: 1 },
      replies: [planReply({ cardCount: 3 }), JSON.stringify({ cards: [card({ lemma: 'Haus' })] })],
    });
    const jobId = await generate(harness);
    const analyzed = await harness.service.analyzeJob({ jobId, actorUserId: ACTOR });
    if (analyzed.status !== 'ok') throw new Error('analysis failed');
    expect(analyzed.job.status).toBe('generating');
    const result = await harness.service.accept({
      jobId,
      actorUserId: ACTOR,
      expectedFingerprint: analyzed.analysis.importableFingerprint,
      selectedRows: [1],
      acceptKey: '77777777-7777-4777-8777-777777777777',
    });
    expect(result.status).toBe('conflict');
    expect(harness.writeStore.createCard).not.toHaveBeenCalled();
  });
});
