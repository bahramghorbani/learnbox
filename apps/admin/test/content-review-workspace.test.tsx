// @vitest-environment jsdom

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Rendered = {
  container: HTMLElement;
  text: string;
  approve(): Promise<void>;
  unmount(): Promise<void>;
};

async function renderWorkspace(): Promise<Rendered> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  // The local preview components rely on the classic React global under test (repo pattern).
  vi.stubGlobal('React', { createElement, Fragment });
  const { ContentReviewWorkspace } = await import('../app/components/ContentReviewWorkspace.js');
  await act(async () => {
    root.render(createElement(ContentReviewWorkspace as FunctionComponent));
    await Promise.resolve();
  });
  return {
    container,
    text: container.textContent ?? '',
    approve: async () => {
      const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
        candidate.textContent?.includes('تأیید در پیش‌نمایش'),
      );
      await act(async () => button?.click());
    },
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

describe('ContentReviewWorkspace (local admin content preview)', () => {
  beforeEach(() => {
    // No splash route exists in a unit environment; the splash panel must degrade to unavailable.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404 }) as unknown as Response),
    );
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
  });

  it('shows the real Start Pack review queue of 20 drafts and keeps publication blocked', async () => {
    const rendered = await renderWorkspace();
    try {
      expect(rendered.text).toContain('بازبینی محتوا');
      expect(rendered.text).toContain('۲۰ کارت در انتظار بررسی');
      expect(rendered.container.querySelectorAll('[data-review-item]')).toHaveLength(20);
      expect(
        rendered.container.querySelectorAll('[data-review-item="start-a1-haus"]'),
      ).toHaveLength(1);
      expect(rendered.text).toContain('انتشار مسدود است');
      expect(rendered.text).toContain('انتشار بسته هنوز ممکن نیست');
    } finally {
      await rendered.unmount();
    }
  });

  it('derives the review card from the draft record instead of fabricating review state', async () => {
    const rendered = await renderWorkspace();
    try {
      // Real draft content for start-a1-haus (content/packs/learnbox-start).
      expect(rendered.text).toContain('das Haus');
      expect(rendered.text).toContain('die Häuser');
      expect(rendered.text).toContain('haʊs');
      expect(rendered.text).toContain('خانه');
      expect(rendered.text).toContain('اسم');
      expect(rendered.text).toContain('Das Haus ist klein.');
      expect(rendered.text).toContain('خانه کوچک است.');
      expect(rendered.text).toContain('Goethe A1 scope reference; editorial verification pending.');

      // The draft has no attached media, so no media may be shown as ready.
      expect(rendered.text).toContain('رسانه‌ای برای این کارت ثبت نشده است');
      expect(
        rendered.container.querySelectorAll('[data-media-state="missing"]').length,
      ).toBeGreaterThan(0);
      expect(rendered.container.querySelectorAll('[data-media-state="attached"]')).toHaveLength(0);

      // Fabricated review claims must not be rendered for an unreviewed draft.
      expect(rendered.text).not.toContain('Das Haus ist groß.');
      expect(rendered.text).not.toContain('۹۲٪');
      expect(rendered.text).not.toContain('پیشنهاد آزمایشی');
      expect(rendered.text).not.toContain('وضعیت آمادگی رسانه‌ها برای این کارت');
      expect(rendered.text).not.toContain('ساختار کارت');
      expect(rendered.text).not.toContain('پخش تلفظ');
    } finally {
      await rendered.unmount();
    }
  });

  it('keeps the six-dimensional review gate pending and only previews local actions', async () => {
    const rendered = await renderWorkspace();
    try {
      expect(rendered.text).toContain('گیت بررسی محتوا');
      expect(
        rendered.container.querySelectorAll('.review-gate-list [data-outcome="pending"]'),
      ).toHaveLength(6);
      expect(
        rendered.container.querySelectorAll('.review-gate-list [data-outcome="passed"]'),
      ).toHaveLength(0);

      await rendered.approve();

      // The action is scoped to the local preview label only: the underlying queue item and the
      // gate stay untouched, so publication remains blocked.
      const textAfterApprove = rendered.container.textContent ?? '';
      expect(textAfterApprove).toContain('در پیش‌نمایش تأیید شد');
      expect(
        rendered.container.querySelectorAll('.review-gate-list [data-outcome="passed"]'),
      ).toHaveLength(0);
      expect(rendered.container.querySelectorAll('[data-review-item]')).toHaveLength(20);
      expect(rendered.text).toContain('۲۰ کارت در انتظار بررسی');
    } finally {
      await rendered.unmount();
    }
  });
});
