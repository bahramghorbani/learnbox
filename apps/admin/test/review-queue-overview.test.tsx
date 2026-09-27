// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { ReviewQueueOverview } from '../app/components/ReviewQueueOverview';

describe('ReviewQueueOverview', () => {
  let container: HTMLElement | undefined;
  let root: ReturnType<typeof createRoot> | undefined;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it('shows the complete review queue and keeps the pack publication blocked', async () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        createElement(ReviewQueueOverview, {
          batchId: 'learnbox-start-a1-v1',
          items: [
            { id: 'start-a1-haus', lemma: 'Haus', status: 'needs_review' },
            { id: 'start-a1-brot', lemma: 'Brot', status: 'needs_review' },
          ],
          publicationBlocked: true,
        }),
      );
    });

    expect(container.textContent).toContain('صف بررسی محتوا');
    expect(container.textContent).toContain('learnbox-start-a1-v1');
    expect(container.textContent).toContain('۲ کارت در انتظار بررسی');
    expect(container.textContent).toContain('انتشار مسدود است');
    expect(container.querySelectorAll('[data-review-item]')).toHaveLength(2);
    expect(container.querySelector('[data-review-item="start-a1-haus"]')).not.toBeNull();
  });

  it('does not claim an empty queue is ready for publication', async () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        createElement(ReviewQueueOverview, {
          batchId: 'empty-batch',
          items: [],
          publicationBlocked: true,
        }),
      );
    });

    expect(container.textContent).toContain('هیچ کارتی در صف بررسی نیست');
    expect(container.textContent).toContain('انتشار مسدود است');
  });
});
