// @vitest-environment jsdom

import { act, createElement, Fragment, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PackMediaCompletion, type PackMediaJob } from '../app/components/PackMediaCompletion';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const needsAttention: PackMediaJob = {
  id: 'job-fixture',
  packId: 'pack-fixture',
  status: 'needs_attention',
  stopRequested: false,
  estimatedMaxSeconds: 0,
  lastProgressAt: '2026-10-20T15:09:52.000Z',
  counts: {
    pending: 228,
    leased: 0,
    dispatching: 0,
    generated: 129,
    not_needed: 0,
    in_progress: 0,
    needs_attention: 1,
    deferred: 0,
    stopped: 0,
  },
  items: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      cardId: 'card-fixture',
      kind: 'sentence_audio',
      status: 'needs_attention',
      candidateId: null,
      detail: 'provider_provider_timeout',
    },
  ],
};

function CompletionHarness({ onFinished }: { onFinished: () => void }) {
  const [tableVisible, setTableVisible] = useState(true);
  return (
    <>
      {tableVisible ? <div data-testid="existing-table">کارت‌های موجود</div> : null}
      <PackMediaCompletion
        packId="pack-fixture"
        cards={[{ cardId: 'card-fixture', label: 'Entschuldigung' }]}
        loadState={async () => undefined}
        loadJob={async () => needsAttention}
        createJob={async () => ({ ok: true as const, status: 'nothing_needed' as const })}
        stopJob={async () => ({ ok: false as const, message: 'unused' })}
        resolveJob={async () => ({ ok: true as const, job: needsAttention })}
        onOpenCard={() => undefined}
        onFinished={() => {
          setTableVisible(false);
          onFinished();
        }}
      />
    </>
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('pack-media polling progress', () => {
  it('keeps the existing table and counts stable across repeated needs_attention polls', async () => {
    vi.useFakeTimers();
    const onFinished = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    vi.stubGlobal('React', { createElement, Fragment });

    await act(async () => {
      root.render(createElement(CompletionHarness, { onFinished }));
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(onFinished).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="existing-table"]')?.textContent).toContain(
      'کارت‌های موجود',
    );
    expect(container.querySelector('[data-pack-media="job-progress"]')?.textContent).toContain(
      '۱۲۹',
    );
    expect(container.querySelector('[data-pack-media="job-progress"]')?.textContent).toContain(
      '۲۲۸',
    );
    expect(container.querySelector('[data-pack-media="job-progress"]')?.textContent).toContain('۱');
    expect(container.textContent).toContain('مهلت پاسخ provider تمام شد');
    expect(container.textContent).toContain('فقط ۲۲۸ مورد pending همین job');
    expect(
      Array.from(container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('موکول‌کردن این مورد'),
      )?.disabled,
    ).toBe(true);
    expect(container.textContent).not.toContain('هیچ رسانه‌ای برای ساخت لازم نیست');

    await act(async () => root.unmount());
  });

  it('removes stale progress rather than showing success when status reading fails', async () => {
    vi.useFakeTimers();
    let reads = 0;
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    vi.stubGlobal('React', { createElement, Fragment });

    await act(async () => {
      root.render(
        createElement(PackMediaCompletion, {
          packId: 'pack-fixture',
          cards: [],
          loadState: async () => undefined,
          loadJob: async () => {
            reads += 1;
            if (reads === 1) return needsAttention;
            throw new Error('read failed');
          },
          createJob: async () => ({ ok: true as const, status: 'nothing_needed' as const }),
          stopJob: async () => ({ ok: false as const, message: 'unused' }),
          onOpenCard: () => undefined,
          onFinished: () => undefined,
        }),
      );
      await Promise.resolve();
    });
    expect(container.querySelector('[data-pack-media="job-progress"]')).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(container.textContent).toContain('خواندن وضعیت اجرای پایدار ناموفق بود');
    expect(container.querySelector('[data-pack-media="job-progress"]')).toBeNull();
    await act(async () => root.unmount());
  });

  it('notifies the parent once for a real running-to-terminal transition', async () => {
    vi.useFakeTimers();
    let reads = 0;
    const onFinished = vi.fn();
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    vi.stubGlobal('React', { createElement, Fragment });

    await act(async () => {
      root.render(
        createElement(PackMediaCompletion, {
          packId: 'pack-fixture',
          cards: [],
          loadState: async () => undefined,
          loadJob: async () => {
            reads += 1;
            return reads === 1 ? { ...needsAttention, status: 'running' as const } : needsAttention;
          },
          createJob: async () => ({ ok: true as const, status: 'nothing_needed' as const }),
          stopJob: async () => ({ ok: false as const, message: 'unused' }),
          onOpenCard: () => undefined,
          onFinished,
        }),
      );
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(onFinished).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });
});
