// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AiPackGenerationModal } from '../app/components/AiPackGenerationModal';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The Admin edits the AI-proposed plan (count, level, topics, essentials) before generation.
 * Guarantees: only changed fields are sent, approval uses the fingerprint of the SAVED plan, a
 * rejected save never approves, and an untouched plan is approved without a revision call.
 */

const plan = {
  packId: 'studium-b1',
  title: 'بستهٔ تحصیل',
  description: 'واژگان دانشجویی',
  audience: 'دانشجویان',
  cefr: 'B1',
  cardCount: 20,
  requestedCount: 20,
  topics: ['دانشگاه', 'مسکن'],
  strategy: 'موضوعی',
  fields: ['lemma'],
  scope: 'فقط واژگان',
  isFree: false,
};

function jobWith(status: string, overrides: Record<string, unknown> = {}, fingerprint = 'b') {
  return {
    jobId: '33333333-3333-4333-8333-333333333333',
    status,
    prompt: 'تحصیل',
    plan: { ...plan, ...overrides },
    planFingerprint: fingerprint.repeat(64),
    provider: 'avalai.ir',
    model: 'claude-opus-5-5',
    reviewerModel: 'claude-fable-5-1',
    progress: {
      requested: 20,
      generated: 0,
      batchSize: 10,
      batchesDone: 0,
      batchesTotal: 2,
      attemptsOnCurrentBatch: 0,
    },
  };
}

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function props(overrides: Record<string, unknown> = {}) {
  return {
    open: true,
    onClose: vi.fn(),
    onPlan: vi.fn(async () => ({ ok: true as const, job: jobWith('planned') })),
    onRevisePlan: vi.fn(async (_jobId: string, _fp: string, edits: Record<string, unknown>) => ({
      ok: true as const,
      job: jobWith('planned', edits, 'd'),
    })),
    onApprovePlan: vi.fn(async () => ({ ok: false as const, message: 'stop-here' })),
    onRunBatch: vi.fn(),
    onRefresh: vi.fn(),
    onAccept: vi.fn(),
    onLoadModels: vi.fn(async () => undefined),
    ...overrides,
  };
}

function button(label: string) {
  return [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(label));
}

function setValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
) {
  const proto =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(element, value);
  element.dispatchEvent(
    new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }),
  );
}

async function openPlan(p: ReturnType<typeof props>) {
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(AiPackGenerationModal, p as never));
  });
  await act(async () => setValue(container.querySelector('textarea')!, 'تحصیل'));
  await act(async () => button('ساخت طرح')!.click());
  expect(container.querySelector('[data-plan-editor]')).not.toBeNull();
}

const field = <T extends Element>(id: string) => container.querySelector<T>(`#${id}`)!;

describe('AI plan editor', () => {
  it('renders every editable plan field with an accessible label', async () => {
    await openPlan(props());
    for (const id of [
      'ai-plan-title',
      'ai-plan-pack-id',
      'ai-plan-cefr',
      'ai-plan-count',
      'ai-plan-access',
      'ai-plan-topics',
      'ai-plan-audience',
      'ai-plan-description',
      'ai-plan-strategy',
      'ai-plan-scope',
    ]) {
      expect(container.querySelector(`label[for="${id}"]`), id).not.toBeNull();
    }
    expect(field<HTMLInputElement>('ai-plan-count').value).toBe('20');
    expect(field<HTMLTextAreaElement>('ai-plan-topics').value).toBe('دانشگاه\nمسکن');
  });

  it('sends only the changed fields, then approves the SAVED plan fingerprint', async () => {
    const p = props();
    await openPlan(p);
    await act(async () => setValue(field('ai-plan-count'), '8'));
    await act(async () => setValue(field('ai-plan-cefr'), 'A2'));
    await act(async () => setValue(field('ai-plan-topics'), 'مسکن\nبانک'));
    expect(container.textContent).toContain('تغییرات ذخیره‌نشده');
    expect(button('ذخیره، تأیید طرح و تولید 8 کارت')).toBeDefined();

    await act(async () => button('ذخیره، تأیید طرح')!.click());
    expect(p.onRevisePlan).toHaveBeenCalledWith(
      '33333333-3333-4333-8333-333333333333',
      'b'.repeat(64),
      {
        cardCount: 8,
        cefr: 'A2',
        topics: ['مسکن', 'بانک'],
      },
    );
    expect(p.onApprovePlan).toHaveBeenCalledWith(
      '33333333-3333-4333-8333-333333333333',
      'd'.repeat(64),
    );
  });

  it('never approves when the server rejects the edit, and shows its reason', async () => {
    const p = props({
      onRevisePlan: vi.fn(async () => ({
        ok: false as const,
        message: 'تعداد کارت حداکثر ۱۰۰ است.',
      })),
    });
    await openPlan(p);
    await act(async () => setValue(field('ai-plan-count'), '500'));
    await act(async () => button('ذخیره، تأیید طرح')!.click());
    expect(p.onApprovePlan).not.toHaveBeenCalled();
    expect(container.textContent).toContain('تعداد کارت حداکثر ۱۰۰ است.');
  });

  it('approves an untouched plan directly, with no revision call', async () => {
    const p = props();
    await openPlan(p);
    await act(async () => button('تأیید طرح و تولید 20 کارت')!.click());
    expect(p.onRevisePlan).not.toHaveBeenCalled();
    expect(p.onApprovePlan).toHaveBeenCalledWith(
      '33333333-3333-4333-8333-333333333333',
      'b'.repeat(64),
    );
  });

  it('blocks approval for an unusable draft (no topics, bad pack id, zero cards)', async () => {
    const p = props();
    await openPlan(p);
    for (const [id, value] of [
      ['ai-plan-topics', '  '],
      ['ai-plan-pack-id', '-bad id'],
      ['ai-plan-count', '0'],
    ] as const) {
      await act(async () => setValue(field(id), value));
      expect(button('ذخیره، تأیید طرح')!.hasAttribute('disabled'), id).toBe(true);
      expect(container.querySelector('[role="alert"]')).not.toBeNull();
      await act(async () =>
        setValue(
          field(id),
          id === 'ai-plan-topics'
            ? 'دانشگاه\nمسکن'
            : id === 'ai-plan-pack-id'
              ? 'studium-b1'
              : '20',
        ),
      );
    }
    expect(p.onApprovePlan).not.toHaveBeenCalled();
  });
});
