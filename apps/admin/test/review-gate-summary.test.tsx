// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { ReviewGateSummary, type ReviewDimensionState } from '../app/components/ReviewGateSummary';

describe('ReviewGateSummary', () => {
  let container: HTMLElement | undefined;
  let root: ReturnType<typeof createRoot> | undefined;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it('shows every required review dimension and keeps publication blocked when incomplete', async () => {
    const checks: ReviewDimensionState[] = [
      { dimension: 'german_linguistic', outcome: 'passed' },
      { dimension: 'persian_translation', outcome: 'passed' },
      { dimension: 'provenance', outcome: 'pending' },
      { dimension: 'visual', outcome: 'pending' },
      { dimension: 'audio', outcome: 'failed' },
      { dimension: 'app_flow', outcome: 'pending' },
    ];
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(createElement(ReviewGateSummary, { checks }));
    });

    expect(container.textContent).toContain('بررسی آلمانی');
    expect(container.textContent).toContain('ترجمهٔ فارسی');
    expect(container.textContent).toContain('منشأ و استناد');
    expect(container.textContent).toContain('بازبینی بصری');
    expect(container.textContent).toContain('بازبینی صوتی');
    expect(container.textContent).toContain('تست جریان کار');
    expect(container.textContent).toContain('انتشار مسدود است');
    expect(container.textContent).toContain('۱ مورد ناموفق');
    expect(container.querySelector('[data-status="publication-blocked"]')).not.toBeNull();
  });

  it('reports readiness only when all six dimensions pass', async () => {
    const checks: ReviewDimensionState[] = [
      'german_linguistic',
      'persian_translation',
      'provenance',
      'visual',
      'audio',
      'app_flow',
    ].map((dimension) => ({
      dimension: dimension as ReviewDimensionState['dimension'],
      outcome: 'passed',
    }));
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(createElement(ReviewGateSummary, { checks }));
    });

    expect(container.textContent).toContain('همهٔ بررسی‌ها تکمیل است');
    expect(container.textContent).toContain('انتشار همچنان نیازمند تأیید ناشر است');
    expect(container.querySelector('[data-status="review-complete"]')).not.toBeNull();
  });

  it('renders missing dimensions as pending instead of hiding a review gate', async () => {
    const checks: ReviewDimensionState[] = [
      { dimension: 'german_linguistic', outcome: 'passed' },
      { dimension: 'persian_translation', outcome: 'passed' },
    ];
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(createElement(ReviewGateSummary, { checks }));
    });

    expect(container.querySelectorAll('.review-gate-list li')).toHaveLength(6);
    expect(container.textContent).toContain('بازبینی صوتی');
    expect(container.textContent).toContain('۴ مورد در انتظار بررسی');
    expect(container.querySelector('[data-status="publication-blocked"]')).not.toBeNull();
  });
});
