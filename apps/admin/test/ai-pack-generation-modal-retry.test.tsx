// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AiPackGenerationModal } from '../app/components/AiPackGenerationModal';

/**
 * Phase 1 / Milestone 1.4 — generation retry must resume, not restart.
 *
 * A transient failure after the plan was approved (expired re-auth, a dropped batch) used to
 * leave retry re-approving an already-approved plan. The server refuses that, so the Admin was
 * stuck on a dead button while the cards the job had already generated — and already paid an AI
 * provider for — stayed unreachable. Retry must dispatch on the job's real status.
 */

const plan = {
  packId: 'german-fruits-a1-basic',
  title: 'میوه‌های پایه به آلمانی',
  description: '',
  audience: '',
  cefr: 'A1',
  cardCount: 4,
  requestedCount: 4,
  topics: [],
  strategy: '',
  fields: [],
  scope: '',
};

function jobWith(status: string, extra: Record<string, unknown> = {}) {
  return {
    ...extra,
    jobId: '33333333-3333-4333-8333-333333333333',
    status,
    prompt: 'میوه‌ها',
    plan,
    planFingerprint: 'b'.repeat(64),
    provider: 'avalai.ir',
    model: 'claude-sonnet-4-5',
    progress: {
      requested: 4,
      generated: 4,
      batchSize: 4,
      batchesDone: 1,
      batchesTotal: 1,
      attemptsOnCurrentBatch: 0,
      ...(extra.progress as object | undefined),
    },
  };
}

const analysis = {
  packId: 'german-fruits-a1-basic',
  filename: 'german-fruits-a1-basic.ai',
  fileKind: 'csv' as const,
  totalRows: 4,
  counts: { new: 4, duplicate_in_file: 0, existing: 0, invalid: 0 },
  rows: [1, 2, 3, 4].map((rowNumber) => ({
    rowNumber,
    classification: 'new' as const,
    lemma: `L${rowNumber}`,
    messages: [],
    content: { lemma: `L${rowNumber}`, persianMeanings: ['م'], examples: [] },
  })),
  unknownHeaders: [],
  missingRequiredColumns: [],
  importableFingerprint: 'c'.repeat(64),
};

let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
  vi.restoreAllMocks();
});

function props(overrides: Record<string, unknown> = {}) {
  return {
    open: true,
    onClose: vi.fn(),
    onPlan: vi.fn(async () => ({ ok: true as const, job: jobWith('planned') })),
    onApprovePlan: vi.fn(async () => ({ ok: true as const, job: jobWith('generating') })),
    onRunBatch: vi.fn(async () => ({ ok: true as const, job: jobWith('generated') })),
    onRefresh: vi.fn(async () => ({ ok: true as const, job: jobWith('generated'), analysis })),
    onAccept: vi.fn(async () => ({ ok: true as const, created: 4, job: jobWith('accepted') })),
    onLoadModels: vi.fn(async () => undefined),
    ...overrides,
  };
}

function findButton(label: string) {
  return [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(label));
}

/** Drives the modal to a job that is approved and fully generated, then fails the refresh. */
async function renderStrandedJob(p: ReturnType<typeof props>) {
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(AiPackGenerationModal, p as never));
  });
  // prompt -> plan
  await act(async () => {
    const textarea = container.querySelector('textarea')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(textarea, 'میوه‌ها');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    findButton('ساخت طرح')!.click();
  });
  return root;
}

describe('M1.4 generation retry', () => {
  it('does not re-approve a plan that is already approved', async () => {
    // The refresh that follows the final batch fails once, stranding the generated job.
    const onRefresh = vi
      .fn()
      .mockResolvedValueOnce({ ok: false as const, message: 'احراز هویت مجدد لازم است.' })
      .mockResolvedValue({ ok: true as const, job: jobWith('generated'), analysis });
    const p = props({ onRefresh });

    const root = await renderStrandedJob(p);
    await act(async () => {
      findButton('تأیید طرح و تولید')!.click();
    });
    expect(p.onApprovePlan).toHaveBeenCalledTimes(1);

    await act(async () => {
      findButton('تلاش دوباره')!.click();
    });

    // The whole point: retry must NOT call approve a second time.
    expect(p.onApprovePlan).toHaveBeenCalledTimes(1);
    // And it must land on the review stage, with the already-generated cards reachable.
    expect(container.textContent).toContain('پذیرش 4 کارت به‌عنوان Draft');

    await act(async () => root.unmount());
  });

  it('resumes remaining batches when the job is still generating', async () => {
    const onRefresh = vi
      .fn()
      .mockResolvedValueOnce({ ok: false as const, message: 'قطع شد' })
      .mockResolvedValueOnce({ ok: true as const, job: jobWith('generating'), analysis })
      .mockResolvedValue({ ok: true as const, job: jobWith('generated'), analysis });
    const onRunBatch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false as const, message: 'قطع شد' })
      .mockResolvedValue({ ok: true as const, job: jobWith('generated') });
    const p = props({ onRefresh, onRunBatch });

    const root = await renderStrandedJob(p);
    await act(async () => {
      findButton('تأیید طرح و تولید')!.click();
    });
    await act(async () => {
      findButton('تلاش دوباره')!.click();
    });

    expect(p.onApprovePlan).toHaveBeenCalledTimes(1);
    // The failed batch is retried rather than abandoned.
    expect(onRunBatch.mock.calls.length).toBeGreaterThan(1);

    await act(async () => root.unmount());
  });
});

describe('a lost batch response never re-sends the batch', () => {
  const notStarted = { progress: { generated: 0, batchesDone: 0 } };

  async function startWithLostResponse(p: ReturnType<typeof props>) {
    const root = await renderStrandedJob(p);
    await act(async () => {
      findButton('تأیید طرح و تولید')!.click();
    });
    return root;
  }

  it.each(['network', 'gateway', 'batch_conflict'])(
    'waits for the server batch after a %s response and continues only once it landed',
    async (code) => {
      vi.useFakeTimers({ shouldAdvanceTime: false });
      try {
        const onApprovePlan = vi.fn(async () => ({
          ok: true as const,
          job: jobWith('generating', notStarted),
        }));
        const onRunBatch = vi.fn(async () => ({ ok: false as const, message: 'قطع', code }));
        const onRefresh = vi
          .fn()
          // still running on the server: keep waiting, do not call the batch again
          .mockResolvedValueOnce({
            ok: true as const,
            job: jobWith('generating', { ...notStarted, batchInFlight: true }),
            analysis,
          })
          .mockResolvedValue({ ok: true as const, job: jobWith('generated'), analysis });
        const p = props({ onApprovePlan, onRunBatch, onRefresh });
        const root = await startWithLostResponse(p);
        expect(container.textContent).toContain('تولید آن روی سرور ادامه دارد');
        await act(async () => {
          await vi.advanceTimersByTimeAsync(10_000);
        });
        expect(onRunBatch).toHaveBeenCalledTimes(1);
        expect(container.textContent).toContain('پذیرش 4 کارت به‌عنوان Draft');
        await act(async () => root.unmount());
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('stops for the Admin when the lost batch did not land, instead of retrying it', async () => {
    const onApprovePlan = vi.fn(async () => ({
      ok: true as const,
      job: jobWith('generating', notStarted),
    }));
    // A second call would succeed, so a client that wrongly re-sends is caught, not hung.
    const onRunBatch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false as const, message: 'قطع', code: 'network' })
      .mockResolvedValue({ ok: true as const, job: jobWith('generated') });
    const onRefresh = vi.fn(async () => ({
      ok: true as const,
      job: jobWith('generating', {
        progress: { generated: 0, batchesDone: 0, attemptsOnCurrentBatch: 1 },
        error: { code: 'provider_incomplete_response', message: 'پاسخ کامل نشد.' },
      }),
      analysis,
    }));
    const p = props({ onApprovePlan, onRunBatch, onRefresh });
    const root = await startWithLostResponse(p);
    expect(onRunBatch).toHaveBeenCalledTimes(1);
    expect(findButton('تلاش دوباره برای این دسته')).toBeDefined();
    expect(container.textContent).toContain('پاسخ کامل نشد.');
    await act(async () => root.unmount());
  });
});
