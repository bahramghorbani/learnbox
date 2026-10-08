// @vitest-environment jsdom

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TodayScreenProps } from '../app/components/TodayScreen';
import type { DeliveredSlide } from '../lib/learner-slider';

/**
 * Phase 4 / Milestone 4.3 — the learner-facing carousel on Today.
 *
 * Rendered as the learner gets it: the real TodayScreen, a fake `/api/banners` in place of the
 * server, and assertions on the DOM that actually reaches a browser.
 *
 * Three groups of claims:
 *   - the Admin-uploaded image is really rendered, from the protected media route, and its absence
 *     or failure degrades to the approved colour rather than a broken slide;
 *   - the carousel is operable: a real button per slide, pagination buttons that a screen reader can
 *     see (the defect this milestone fixes was focusable buttons inside `aria-hidden=true`),
 *     auto-rotation that stops for `prefers-reduced-motion`, and swipe that does not misfire as a tap;
 *   - every destination goes exactly where the Admin pointed it, and nothing goes anywhere unsafe.
 */

const slide = (overrides: Partial<DeliveredSlide> = {}): DeliveredSlide => ({
  id: 'banner_a1b2c3d4',
  title: 'بسته‌های تازه',
  description: 'همین حالا ببین',
  backgroundColor: '#102030',
  destination: { kind: 'screen', screen: 'store' },
  hasImage: true,
  ...overrides,
});

type Rendered = {
  container: HTMLElement;
  slider(): HTMLElement | null;
  slides(): HTMLButtonElement[];
  images(): HTMLImageElement[];
  dots(): HTMLElement | null;
  dotButtons(): HTMLButtonElement[];
  text(): string;
  unmount(): Promise<void>;
};

let rendered: Rendered | undefined;
let openedWindows: Array<{ url: string; target: string; features: string }>;

function stubSlider(payload: unknown, options: { fail?: boolean } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = String(input);
      if (url.startsWith('/api/banners')) {
        if (options.fail) throw new Error('slider unavailable');
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }),
  );
}

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })),
  );
}

async function renderToday(props: Partial<TodayScreenProps> = {}): Promise<Rendered> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  const { TodayScreen } = await import('../app/components/TodayScreen.jsx');
  await act(async () => {
    root.render(
      createElement(
        TodayScreen as FunctionComponent<TodayScreenProps>,
        {
          reviewCount: 3,
          pendingReviewCount: 0,
          ...props,
        } as TodayScreenProps,
      ),
    );
  });

  return {
    container,
    slider: () => container.querySelector<HTMLElement>('[data-testid="learnbox-slider"]'),
    slides: () => Array.from(container.querySelectorAll<HTMLButtonElement>('.banner-slide')),
    images: () => Array.from(container.querySelectorAll<HTMLImageElement>('.banner-image')),
    dots: () => container.querySelector<HTMLElement>('.banner-dots'),
    dotButtons: () => Array.from(container.querySelectorAll<HTMLButtonElement>('.bndot')),
    text: () => container.textContent ?? '',
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function pointerEvent(type: string, clientX: number) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    clientX?: number;
    pointerId?: number;
  };
  event.clientX = clientX;
  event.pointerId = 1;
  return event;
}

beforeEach(() => {
  openedWindows = [];
  vi.stubGlobal(
    'open',
    vi.fn((url: string, target: string, features: string) => {
      openedWindows.push({ url, target, features });
      return null;
    }),
  );
  stubReducedMotion(false);
});

afterEach(async () => {
  await rendered?.unmount();
  rendered = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('M4.3 — the real slide image on Today', () => {
  it('renders the Admin-uploaded image from the protected media route', async () => {
    stubSlider({ slides: [slide()] });
    rendered = await renderToday();

    const images = rendered.images();
    expect(images).toHaveLength(1);
    expect(images[0].getAttribute('src')).toBe('/api/banners/banner_a1b2c3d4/image');
    // Read from the canonical learner path, with no variant or legacy query of its own.
    const requested = (
      globalThis.fetch as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls.map((call) => String(call[0]));
    expect(requested).toContain('/api/banners');
    // Decorative: the title beside it carries the meaning, so it is not announced twice.
    expect(images[0].getAttribute('alt')).toBe('');
    expect(rendered.text()).toContain('بسته‌های تازه');
  });

  it('never points a slide image at a public static path or a second storage system', async () => {
    stubSlider({ slides: [slide()] });
    rendered = await renderToday();

    const source = rendered.images()[0].getAttribute('src') ?? '';
    expect(source.startsWith('/api/banners/')).toBe(true);
    expect(source).not.toContain('/images/');
    expect(source).not.toContain('/_next/image');
    expect(source).not.toContain('blob.vercel-storage.com');
    expect(source).not.toContain('http://');
  });

  it('shows the approved colour, with no image element, when a slide has no image', async () => {
    stubSlider({ slides: [slide({ hasImage: false })] });
    rendered = await renderToday();

    expect(rendered.images()).toHaveLength(0);
    expect(rendered.slides()).toHaveLength(1);
    expect(rendered.slides()[0].style.background).toContain('rgb(16, 32, 48)');
    expect(rendered.text()).toContain('بسته‌های تازه');
  });

  it('falls back safely when the image cannot be loaded', async () => {
    stubSlider({ slides: [slide()] });
    rendered = await renderToday();
    expect(rendered.images()).toHaveLength(1);

    await act(async () => {
      rendered!.images()[0].dispatchEvent(new Event('error', { bubbles: true }));
    });

    expect(rendered.images()).toHaveLength(0);
    expect(rendered.slides()).toHaveLength(1);
    expect(rendered.slides()[0].style.background).toContain('rgb(16, 32, 48)');
    expect(rendered.text()).toContain('بسته‌های تازه');
  });

  it('falls back to the theme colour when the Admin stored no colour', async () => {
    stubSlider({ slides: [slide({ hasImage: false, backgroundColor: null })] });
    rendered = await renderToday();
    expect(rendered.slides()[0].style.background).toContain('var(--primary)');
  });
});

describe('M4.3 — the carousel is operable and accessible', () => {
  const three = [
    slide({ id: 'banner_one', title: 'یک' }),
    slide({ id: 'banner_two', title: 'دو' }),
    slide({ id: 'banner_three', title: 'سه' }),
  ];

  it('does not hide its own pagination buttons from assistive technology', async () => {
    stubSlider({ slides: three });
    rendered = await renderToday();

    const dots = rendered.dots();
    expect(dots).not.toBeNull();
    // The defect: focusable buttons inside aria-hidden=true — reachable by keyboard, invisible to
    // a screen reader.
    expect(dots?.getAttribute('aria-hidden')).toBeNull();
    expect(dots?.getAttribute('role')).toBe('group');
    expect(dots?.getAttribute('aria-label')).toBeTruthy();
    expect(rendered.dotButtons()).toHaveLength(3);
    for (const dot of rendered.dotButtons()) {
      expect(dot.getAttribute('aria-label')).toBeTruthy();
      expect(dot.closest('[aria-hidden="true"]')).toBeNull();
    }
    expect(rendered.dotButtons()[0].getAttribute('aria-current')).toBe('true');
    expect(rendered.dotButtons()[1].getAttribute('aria-current')).toBeNull();
  });

  it('exposes the slider as a labelled region and each slide as a real button', async () => {
    stubSlider({ slides: three });
    rendered = await renderToday();

    expect(rendered.slider()?.getAttribute('role')).toBe('region');
    expect(rendered.slider()?.getAttribute('aria-label')).toBeTruthy();
    for (const element of rendered.slides()) {
      // A real button: Enter and Space activate it and it is announced as a control.
      expect(element.tagName).toBe('BUTTON');
      expect(element.getAttribute('type')).toBe('button');
    }
  });

  it('keeps off-screen slides out of the tab order and out of the accessibility tree', async () => {
    stubSlider({ slides: three });
    rendered = await renderToday();

    const [first, second, third] = rendered.slides();
    expect(first.getAttribute('aria-hidden')).toBeNull();
    expect(first.tabIndex).toBe(0);
    expect(second.getAttribute('aria-hidden')).toBe('true');
    expect(second.tabIndex).toBe(-1);
    expect(third.tabIndex).toBe(-1);

    await act(async () => rendered!.dotButtons()[1].click());

    expect(rendered.slides()[0].getAttribute('aria-hidden')).toBe('true');
    expect(rendered.slides()[0].tabIndex).toBe(-1);
    expect(rendered.slides()[1].getAttribute('aria-hidden')).toBeNull();
    expect(rendered.slides()[1].tabIndex).toBe(0);
  });

  it('changes slide when a pagination button is pressed', async () => {
    stubSlider({ slides: three });
    rendered = await renderToday();
    const track = rendered.container.querySelector<HTMLElement>('.banner-track');
    expect(track?.style.transform).toBe('translateX(0%)');

    await act(async () => rendered!.dotButtons()[2].click());

    expect(rendered.container.querySelector<HTMLElement>('.banner-track')?.style.transform).toBe(
      'translateX(200%)',
    );
    expect(rendered.dotButtons()[2].className).toContain('on');
  });

  it('auto-rotates, and stops auto-rotating for a learner who asked for less motion', async () => {
    vi.useFakeTimers();
    stubSlider({ slides: three });
    rendered = await renderToday();

    const transform = () =>
      rendered!.container.querySelector<HTMLElement>('.banner-track')?.style.transform;
    expect(transform()).toBe('translateX(0%)');
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    expect(transform()).toBe('translateX(100%)');
    await rendered.unmount();

    stubReducedMotion(true);
    stubSlider({ slides: three });
    rendered = await renderToday();
    expect(transform()).toBe('translateX(0%)');
    await act(async () => {
      vi.advanceTimersByTime(20000);
    });
    expect(transform()).toBe('translateX(0%)');
    // The learner can still move the carousel themselves.
    await act(async () => rendered!.dotButtons()[1].click());
    expect(transform()).toBe('translateX(100%)');
  });

  it('advances on a swipe without treating the swipe as a tap on the slide', async () => {
    const onNavigate = vi.fn();
    stubSlider({ slides: three });
    rendered = await renderToday({ onNavigate });
    const track = rendered.container.querySelector<HTMLElement>('.banner-track');

    await act(async () => {
      track?.dispatchEvent(pointerEvent('pointerdown', 300));
      track?.dispatchEvent(pointerEvent('pointerup', 200));
      rendered!.slides()[0].click();
    });

    expect(rendered.container.querySelector<HTMLElement>('.banner-track')?.style.transform).toBe(
      'translateX(100%)',
    );
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('treats a tap as a tap: a press that barely moves still navigates', async () => {
    const onNavigate = vi.fn();
    stubSlider({ slides: three });
    rendered = await renderToday({ onNavigate });
    const track = rendered.container.querySelector<HTMLElement>('.banner-track');

    await act(async () => {
      track?.dispatchEvent(pointerEvent('pointerdown', 300));
      track?.dispatchEvent(pointerEvent('pointerup', 303));
      rendered!.slides()[0].click();
    });

    expect(onNavigate).toHaveBeenCalledWith('store');
  });

  it('shows no pagination for a single slide', async () => {
    stubSlider({ slides: [slide()] });
    rendered = await renderToday();
    expect(rendered.dots()).toBeNull();
  });
});

describe('M4.3 — where a slide takes the learner', () => {
  it('opens the Store for a Store slide', async () => {
    const onNavigate = vi.fn();
    stubSlider({ slides: [slide({ destination: { kind: 'screen', screen: 'store' } })] });
    rendered = await renderToday({ onNavigate });

    await act(async () => rendered!.slides()[0].click());
    expect(onNavigate).toHaveBeenCalledWith('store');
  });

  it('opens each internal screen the Admin may choose', async () => {
    for (const screen of ['today', 'words', 'progress', 'profile', 'store'] as const) {
      const onNavigate = vi.fn();
      stubSlider({ slides: [slide({ destination: { kind: 'screen', screen } })] });
      const view = await renderToday({ onNavigate });
      await act(async () => view.slides()[0].click());
      expect(onNavigate).toHaveBeenCalledWith(screen);
      await view.unmount();
    }
  });

  it('asks for a specific Pack by id, and does not merely open the Store', async () => {
    const onNavigate = vi.fn();
    const onNavigateToPack = vi.fn();
    stubSlider({ slides: [slide({ destination: { kind: 'pack', packId: 'start-a1' } })] });
    rendered = await renderToday({ onNavigate, onNavigateToPack });

    await act(async () => rendered!.slides()[0].click());
    expect(onNavigateToPack).toHaveBeenCalledWith('start-a1');
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('opens a safe external link in a new tab with no window handle back', async () => {
    stubSlider({
      slides: [slide({ destination: { kind: 'url', url: 'https://learnboxapp.com/blog/x' } })],
    });
    rendered = await renderToday();

    await act(async () => rendered!.slides()[0].click());
    expect(openedWindows).toEqual([
      { url: 'https://learnboxapp.com/blog/x', target: '_blank', features: 'noopener,noreferrer' },
    ]);
  });

  it('refuses a non-https destination even if one somehow reaches the client', async () => {
    for (const url of ['javascript:alert(1)', 'http://promo.example.com/x', 'data:text/html,x']) {
      stubSlider({ slides: [slide({ destination: { kind: 'url', url } })] });
      const view = await renderToday();
      await act(async () => view.slides()[0].click());
      expect(openedWindows).toEqual([]);
      await view.unmount();
    }
  });
});

describe('M4.3 — the slider never breaks Today', () => {
  it('renders no carousel at all when there are no active slides', async () => {
    stubSlider({ slides: [] });
    rendered = await renderToday();

    expect(rendered.slider()).toBeNull();
    expect(rendered.slides()).toHaveLength(0);
    expect(rendered.text()).toContain('کارت');
  });

  it('renders Today normally when the slider API is unavailable', async () => {
    stubSlider({ slides: [] }, { fail: true });
    rendered = await renderToday();

    expect(rendered.slider()).toBeNull();
    expect(rendered.text()).toContain('کارت');
  });

  it('renders Today normally when the payload is not what the client expects', async () => {
    stubSlider({ banners: [{ id: 'legacy', title: 'شکل قدیمی' }] });
    rendered = await renderToday();

    expect(rendered.slider()).toBeNull();
    expect(rendered.text()).not.toContain('شکل قدیمی');
  });

  it('never presents more than three slides, whatever the payload carries', async () => {
    stubSlider({
      slides: Array.from({ length: 6 }, (_, index) =>
        slide({ id: `banner_extra_${index}`, title: `اسلاید ${index}` }),
      ),
    });
    rendered = await renderToday();

    expect(rendered.slides()).toHaveLength(3);
    expect(rendered.dotButtons()).toHaveLength(3);
    expect(rendered.text()).not.toContain('اسلاید 3');
  });

  it('renders the slides in the order the server delivered them, unfiltered', async () => {
    stubSlider({
      slides: [
        slide({ id: 'banner_zzz', title: 'اول' }),
        slide({ id: 'banner_aaa', title: 'دوم' }),
      ],
    });
    rendered = await renderToday();

    expect(rendered.slides().map((element) => element.textContent)).toEqual([
      expect.stringContaining('اول'),
      expect.stringContaining('دوم'),
    ]);
  });
});
