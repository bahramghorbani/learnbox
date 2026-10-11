// @vitest-environment jsdom

/**
 * Stage 4 presentation contract for the content review workspace.
 *
 * The lifecycle, step-up and idempotency behaviour is pinned by `content-review-workspace.test.tsx`
 * and must not be restated here. This file pins what Stage 4 changed and what a future restyle
 * could silently break:
 *
 *   1. the approved workspace vocabulary (`.cp-workspace` shell, `page-head`, `card`, `kpi`,
 *      `badge`, `btn`) instead of a second, parallel set of review-only styles;
 *   2. figure honesty — every counter and badge on the screen is derived from the server payload,
 *      so no number or status can be invented by the UI;
 *   3. the shared Loading / Empty / Error states, with a refusal (amber) told apart from a fault;
 *   4. accessibility: one page heading, panels labelled by real elements, a single pressed queue
 *      row, German read LTR and identifiers isolated from the Persian text direction;
 *   5. no publication control: review is editorial only.
 */

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ServerBackedContentReview } from '../app/components/ContentReviewWorkspace.js';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: async () => ({ id: 'credential' }),
}));

type ReviewDimension =
  'german_linguistic' | 'persian_translation' | 'provenance' | 'visual' | 'audio' | 'app_flow';

const allDimensions: ReviewDimension[] = [
  'german_linguistic',
  'persian_translation',
  'provenance',
  'visual',
  'audio',
  'app_flow',
];

function makeItem(options: {
  id: string;
  contentId: string;
  lemma: string;
  status: 'auto_validated' | 'needs_review';
  mediaCount?: number;
  passed?: ReviewDimension[];
  failed?: ReviewDimension[];
}) {
  const passed = options.passed ?? [];
  const failed = options.failed ?? [];
  return {
    cardVersionId: options.id,
    contentId: options.contentId,
    lemma: options.lemma,
    status: options.status,
    article: 'das',
    partOfSpeech: 'noun',
    persianMeanings: ['خانه'],
    essentialInflection: null,
    pronunciationIpa: null,
    examples: [],
    mediaCount: options.mediaCount ?? 0,
    sourceProvider: 'editorial',
    sourceReference: 'Goethe A1',
    checks: allDimensions.map((dimension) => ({
      dimension,
      outcome: passed.includes(dimension)
        ? 'passed'
        : failed.includes(dimension)
          ? 'failed'
          : 'pending',
      notes: null,
      reviewedAt: passed.includes(dimension) || failed.includes(dimension) ? '2026-10-11' : null,
    })),
  };
}

/** Two passed, one failed, three pending: every badge tone and both counters are exercised. */
const queuePayload = {
  items: [
    makeItem({
      id: 'b89dabb1-406a-5b88-b535-4e90ba6af24c',
      contentId: 'start-a1-haus',
      lemma: 'Haus',
      status: 'needs_review',
      mediaCount: 2,
      passed: ['german_linguistic', 'persian_translation'],
      failed: ['visual'],
    }),
    makeItem({
      id: 'a477921f-a102-5b84-9f56-d243f432e36e',
      contentId: 'start-a1-tisch',
      lemma: 'Tisch',
      status: 'auto_validated',
    }),
    makeItem({
      id: 'c0ffee00-0000-4000-8000-000000000001',
      contentId: 'start-a1-apfel',
      lemma: 'Apfel',
      status: 'auto_validated',
    }),
  ],
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function renderReview(response: () => Response | Promise<Response>) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response()),
  );
  await act(async () => {
    root.render(createElement(ServerBackedContentReview as FunctionComponent));
    await Promise.resolve();
  });
  await act(async () => {
    await new Promise((done) => setTimeout(done, 0));
  });
  return {
    container,
    get text() {
      return container.textContent ?? '';
    },
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function renderShell() {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => jsonResponse({}, 404)),
  );
  const { ContentReviewWorkspace } = await import('../app/components/ContentReviewWorkspace.js');
  await act(async () => {
    root.render(createElement(ContentReviewWorkspace as FunctionComponent));
    await Promise.resolve();
  });
  return {
    container,
    get text() {
      return container.textContent ?? '';
    },
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

describe('content review shell (approved workspace vocabulary)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the review page inside the shared workspace shell, not a review-only chrome', async () => {
    const rendered = await renderShell();
    try {
      const shell = rendered.container.querySelector('main.admin-shell');
      expect(shell).not.toBeNull();
      // Every reference rule is scoped under `.cp-workspace`; without it the approved design
      // silently does not apply to this page, which is exactly the Stage 4 defect.
      expect(shell?.classList.contains('cp-workspace')).toBe(true);
      expect(rendered.container.querySelector('.page-head')).not.toBeNull();
      const headings = rendered.container.querySelectorAll('h1');
      expect(headings).toHaveLength(1);
      expect(headings[0]?.textContent).toBe('بازبینی محتوا');
      // The retired review-only chrome must not come back alongside the shared one.
      expect(rendered.container.querySelector('.admin-topbar')).toBeNull();
      expect(rendered.container.querySelector('.editor-identity')).toBeNull();
    } finally {
      await rendered.unmount();
    }
  });

  it('states the session and publication status without a session', async () => {
    const rendered = await renderShell();
    try {
      const chip = rendered.container.querySelector('.page-head .chip');
      expect(chip?.textContent).toBe('بدون ورود');
      expect(chip?.classList.contains('on')).toBe(false);
      expect(rendered.text).toContain('محتوا فقط پس از ورود امن نمایش داده می‌شود');
      // A refusal is amber (not allowed), never rose (something broke).
      const refusal = rendered.container.querySelector(
        '[data-review-unavailable="true"] .err-block',
      );
      expect(refusal?.classList.contains('amber')).toBe(true);
    } finally {
      await rendered.unmount();
    }
  });
});

describe('content review workspace (shared states)', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => '__Host-learnbox_admin_csrf=csrf-token-value',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (document as unknown as { cookie?: string }).cookie;
  });

  it('uses the shared empty pattern when the server queue is empty', async () => {
    const rendered = await renderReview(() => jsonResponse({ items: [] }));
    try {
      expect(rendered.container.querySelector('.empty-xl')).not.toBeNull();
      expect(rendered.container.querySelector('[data-review-panel]')).toBeNull();
      expect(rendered.text).toContain('صف بررسی خالی است');
    } finally {
      await rendered.unmount();
    }
  });

  it('uses the shared error pattern with a recovery action when the queue cannot be read', async () => {
    const rendered = await renderReview(() => jsonResponse({}, 500));
    try {
      const block = rendered.container.querySelector('.err-block');
      expect(block).not.toBeNull();
      // Rose: the server failed. Amber would claim the operator is not allowed.
      expect(block?.classList.contains('amber')).toBe(false);
      const retry = rendered.container.querySelector('.err-block button');
      expect(retry?.textContent).toContain('تلاش دوباره');
      expect(retry?.classList.contains('btn')).toBe(true);
    } finally {
      await rendered.unmount();
    }
  });

  it('tells an invalid session apart from a fault with the amber refusal tone', async () => {
    const rendered = await renderReview(() => jsonResponse({}, 401));
    try {
      const block = rendered.container.querySelector('.err-block');
      expect(block?.classList.contains('amber')).toBe(true);
      expect(rendered.text).toContain('نشست امن معتبر نیست');
      expect(rendered.container.querySelector('[data-review-panel]')).toBeNull();
    } finally {
      await rendered.unmount();
    }
  });
});

describe('content review workspace (figure honesty and reference anatomy)', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => '__Host-learnbox_admin_csrf=csrf-token-value',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (document as unknown as { cookie?: string }).cookie;
  });

  it('builds all three counters from the server payload and prints no other figure', async () => {
    const rendered = await renderReview(() => jsonResponse(queuePayload));
    try {
      const metric = (name: string) =>
        rendered.container.querySelector(`[data-review-metric="${name}"]`)?.textContent?.trim();
      // 3 items, 2 passed dimensions on the selected card, mediaCount 2 — all from the payload.
      expect(metric('queue-total')).toBe('۳');
      expect(metric('checks-passed')).toBe('۲ از ۶');
      expect(metric('media-count')).toBe('۲');
      // Reference `kpi` cards, each with its own label, so a bare number never stands alone.
      const kpis = rendered.container.querySelectorAll('.review-metrics .kpi');
      expect(kpis).toHaveLength(3);
      for (const kpi of Array.from(kpis)) {
        expect(kpi.querySelector('.kpi-label')?.textContent?.trim().length).toBeGreaterThan(0);
        expect(kpi.querySelector('.kpi-value')).not.toBeNull();
      }
      // No money, no sales, no invented percentage anywhere on a review screen.
      for (const forbidden of ['درآمد', 'تومان', 'فروش', '٪', '%']) {
        expect(rendered.text).not.toContain(forbidden);
      }
    } finally {
      await rendered.unmount();
    }
  });

  it('shows the stored queue status per card instead of treating every row the same', async () => {
    const rendered = await renderReview(() => jsonResponse(queuePayload));
    try {
      const rows = Array.from(rendered.container.querySelectorAll('.server-queue-row'));
      expect(rows).toHaveLength(3);
      const badges = rows.map((row) => row.querySelector('.badge')?.textContent);
      expect(badges).toEqual(['نیازمند بررسی', 'اعتبارسنجی خودکار', 'اعتبارسنجی خودکار']);
      // Tone follows the stored status: amber asks for work, grey is already machine-checked.
      expect(rows[0]?.querySelector('.badge')?.className).toBe('badge b-amber');
      expect(rows[1]?.querySelector('.badge')?.className).toBe('badge b-grey');
      // The head counter is the number of rows that really are waiting for a human.
      expect(rendered.container.querySelector('.server-review-head')?.textContent).toContain(
        '۱ نیازمند بررسی',
      );
    } finally {
      await rendered.unmount();
    }
  });

  it('gives each gate dimension the badge tone of its persisted outcome', async () => {
    const rendered = await renderReview(() => jsonResponse(queuePayload));
    try {
      const tone = (dimension: string) =>
        rendered.container.querySelector(`[data-dimension="${dimension}"] .badge`)?.className;
      expect(tone('german_linguistic')).toBe('badge b-green');
      expect(tone('visual')).toBe('badge b-rose');
      expect(tone('audio')).toBe('badge b-grey');
      // A decided dimension offers no check buttons; only a pending one does.
      const decided = rendered.container.querySelector('[data-dimension="german_linguistic"]');
      expect(decided?.querySelectorAll('button')).toHaveLength(0);
      const pending = rendered.container.querySelector('[data-dimension="audio"]');
      expect(pending?.querySelectorAll('button')).toHaveLength(2);
      expect(pending?.querySelector('button')?.className).toContain('btn');
      // 2 of 6 passed, so the panel badge must not claim the gate is complete.
      const gateBadge = rendered.container.querySelector(
        '.review-decision-panel .card-head .badge',
      );
      expect(gateBadge?.textContent).toBe('۲ از ۶');
      expect(gateBadge?.className).toBe('badge b-amber');
    } finally {
      await rendered.unmount();
    }
  });

  it('keeps every panel a card with a heading a screen reader can reach', async () => {
    const rendered = await renderReview(() => jsonResponse(queuePayload));
    try {
      const panels = Array.from(rendered.container.querySelectorAll('[data-review-panel]'));
      expect(panels.map((panel) => panel.getAttribute('data-review-panel'))).toEqual([
        'queue',
        'content',
        'decision',
      ]);
      for (const panel of panels) {
        expect(panel.classList.contains('card')).toBe(true);
        const labelId = panel.getAttribute('aria-labelledby');
        expect(labelId).toBeTruthy();
        const label = rendered.container.querySelector(`#${labelId}`);
        expect(label?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
        expect(label?.tagName).toBe('H3');
      }
      // Exactly one selected row, announced as a pressed toggle.
      expect(
        rendered.container.querySelectorAll('.server-queue-row[aria-pressed="true"]'),
      ).toHaveLength(1);
      // German is read left-to-right, identifiers are isolated from the Persian direction.
      const selectedWord = rendered.container.querySelector('.server-card-detail');
      expect(selectedWord?.getAttribute('lang')).toBe('de');
      expect(selectedWord?.getAttribute('dir')).toBe('ltr');
      expect(
        rendered.container
          .querySelector('.server-queue-row .list-sub')
          ?.classList.contains('keep-latin'),
      ).toBe(true);
    } finally {
      await rendered.unmount();
    }
  });

  it('offers editorial decisions only — no publication control on the review screen', async () => {
    const rendered = await renderReview(() => jsonResponse(queuePayload));
    try {
      const panel = rendered.container.querySelector('.review-decision-panel');
      const labels = Array.from(panel?.querySelectorAll('button') ?? []).map((button) =>
        button.textContent?.trim(),
      );
      // 3 pending dimensions × 2 + final approve + return = 8 controls, and nothing else.
      expect(labels).toHaveLength(8);
      // Outside the decision panel the only buttons are the 3 queue rows, which just select.
      expect(rendered.container.querySelectorAll('button')).toHaveLength(11);
      expect(labels.filter((label) => label === 'تأیید')).toHaveLength(3);
      expect(labels.filter((label) => label === 'ناموفق')).toHaveLength(3);
      expect(labels).toContain('تأیید نهایی سردبیری');
      expect(labels).toContain('بازگرداندن برای اصلاح');
      for (const forbidden of ['انتشار', 'حذف', 'قیمت']) {
        expect(labels.some((label) => label?.includes(forbidden))).toBe(false);
      }
      // The final approval stays unavailable until the gate is complete, and says why.
      const approve = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('تأیید نهایی سردبیری'),
      );
      expect((approve as HTMLButtonElement | undefined)?.disabled).toBe(true);
      expect(rendered.text).toContain('تأیید نهایی فقط پس از تأیید هر شش بُعد');
      expect(
        rendered.container.querySelector('[data-publication="disabled"]')?.textContent,
      ).toContain('انتشار بسته غیرفعال است');
    } finally {
      await rendered.unmount();
    }
  });
});

describe('content review styles (one vocabulary, no parallel review theme)', () => {
  const css = readFileSync(resolve(__dirname, '../app/globals.css'), 'utf8');

  it('styles the review screen with the reference primitives', () => {
    // A disabled `.btn` is undefined in the reference, and this screen disables the final
    // approval by design, so the state must be defined once for the whole workspace.
    expect(css).toContain('.cp-workspace .btn:disabled');
    expect(css).toContain('.review-metrics {');
    expect(css).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));');
  });

  it('no longer carries the retired review-only theme', () => {
    // Each of these styled a surface that no component renders any more. Left in the sheet they
    // invite a future change to re-create a second, divergent review design.
    for (const retired of [
      '.admin-topbar',
      '.editor-identity',
      '.editor-avatar',
      '.admin-preview-notice',
      '.review-layout',
      '.review-card',
      '.review-inspector',
      '.review-queue-overview',
      '.review-gate-summary',
      '.approve-button',
      '.return-button',
      '.prototype-note',
      '.retry-button',
      '.confidence-meter',
      '.validation-list',
    ]) {
      expect(css).not.toContain(retired);
    }
  });
});
