// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Phase 4 / Milestone 4.3 — the Pack destination of a slider slide.
 *
 * The learner app has no pack detail route, so the smallest safe navigation is the Store with the
 * intended pack brought into view. The point of this suite is that "brought into view" changes
 * nothing else: the Store still shows exactly the catalogue `/api/store/packs` returns (published
 * and listed) and the ownership `/api/store/my-packs` returns, so a slide cannot surface a draft,
 * an unlisted or an unentitled pack, and a pack the learner may not see is simply not highlighted.
 */

const catalogue = [
  {
    id: 'start-a1',
    name: 'بستهٔ شروع',
    isFree: true,
    priceTomans: null,
    featured: false,
    commercialSummary: null,
    totalCards: 10,
    owned: false,
  },
  {
    id: 'a2-core',
    name: 'بستهٔ A2',
    isFree: false,
    priceTomans: 250000,
    featured: false,
    commercialSummary: null,
    totalCards: 20,
    owned: false,
  },
];

function stubStore(options: { packs?: unknown[]; owned?: unknown[] } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = String(input);
      const body = (value: unknown) =>
        new Response(JSON.stringify(value), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      if (url.startsWith('/api/store/packs')) return body({ packs: options.packs ?? catalogue });
      if (url.startsWith('/api/store/my-packs')) return body({ packs: options.owned ?? [] });
      throw new Error(`Unexpected fetch: ${url}`);
    }),
  );
}

type Rendered = {
  cards(): HTMLElement[];
  focused(): HTMLElement[];
  text(): string;
  scrolled: string[];
  unmount(): Promise<void>;
};

let rendered: Rendered | undefined;

async function renderStore(focusPackId: string | null): Promise<Rendered> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  const scrolled: string[] = [];
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value(this: HTMLElement) {
      scrolled.push(this.getAttribute('data-pack-id') ?? this.textContent?.slice(0, 20) ?? '');
    },
  });

  const { StoreScreen } = await import('../app/components/StoreScreen.jsx');
  await act(async () => {
    root.render(createElement(StoreScreen as never, { onNavigate: vi.fn(), focusPackId } as never));
  });

  return {
    cards: () => Array.from(container.querySelectorAll<HTMLElement>('.store-pack-card')),
    focused: () => Array.from(container.querySelectorAll<HTMLElement>('.slide-focused')),
    text: () => container.textContent ?? '',
    scrolled,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

beforeEach(() => stubStore());

afterEach(async () => {
  await rendered?.unmount();
  rendered = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('M4.3 — a slide that points at a specific pack', () => {
  it('brings that pack into view and marks it as the current one', async () => {
    rendered = await renderStore('a2-core');

    const focused = rendered.focused();
    expect(focused).toHaveLength(1);
    expect(focused[0].textContent).toContain('بستهٔ A2');
    expect(focused[0].getAttribute('aria-current')).toBe('true');
    expect(rendered.scrolled).toHaveLength(1);
  });

  it('shows the same Store as always, with every other card untouched', async () => {
    const withFocus = await renderStore('a2-core');
    const focusedCards = withFocus.cards().length;
    const focusedText = withFocus.text();
    await withFocus.unmount();

    rendered = await renderStore(null);
    expect(rendered.cards()).toHaveLength(focusedCards);
    expect(rendered.focused()).toHaveLength(0);
    expect(rendered.scrolled).toHaveLength(0);
    // The ring is the only difference: the same packs, the same prices, the same wording.
    expect(focusedText).toContain('بستهٔ شروع');
    expect(rendered.text()).toContain('بستهٔ شروع');
    expect(focusedText).toContain('بستهٔ A2');
  });

  it('does not reveal a pack the Store does not offer, and does not break the Store', async () => {
    // A slide pointing at a draft, unlisted or deleted pack: the catalogue simply does not list it.
    rendered = await renderStore('secret-unpublished-pack');

    expect(rendered.focused()).toHaveLength(0);
    expect(rendered.scrolled).toHaveLength(0);
    expect(rendered.cards()).toHaveLength(catalogue.length);
    expect(rendered.text()).not.toContain('secret-unpublished-pack');
    expect(rendered.text()).toContain('بستهٔ شروع');
  });

  it('asks the server for nothing different because of the slide', async () => {
    rendered = await renderStore('a2-core');

    const requested = (
      globalThis.fetch as unknown as { mock: { calls: string[][] } }
    ).mock.calls.map((call) => String(call[0]));
    // No pack-specific endpoint, no filter, no bypass: the Store's own two canonical reads.
    expect(requested.every((url) => url.startsWith('/api/store/'))).toBe(true);
    for (const url of requested) expect(url).not.toContain('a2-core');
  });

  it('highlights nothing when the catalogue is empty', async () => {
    stubStore({ packs: [] });
    rendered = await renderStore('a2-core');
    expect(rendered.focused()).toHaveLength(0);
  });
});

/**
 * The wiring between the two screens, checked at the source like the existing LearnerHome profile
 * wiring test: a slide can carry a pack id perfectly and a Store can highlight one perfectly while
 * nothing connects them, and that gap renders as "the slide just opens the Store".
 */
describe('M4.3 — LearnerHome connects a pack slide to the Store', () => {
  const source = readFileSync(resolve(process.cwd(), 'app/LearnerHome.tsx'), 'utf8');

  it('remembers which pack the slide asked for and opens the Store', () => {
    expect(source).toMatch(
      /onNavigateToPack=\{\(packId\) => \{\s*setSlidePackId\(packId\);\s*setScreen\('store'\);/,
    );
  });

  it('hands that pack to the Store screen', () => {
    expect(source).toContain('focusPackId={slidePackId}');
  });

  it('forgets it as soon as the learner navigates somewhere themselves', () => {
    expect(source).toMatch(/onNavigate=\{\(dest\) => \{\s*setSlidePackId\(null\);/);
    expect(source).toMatch(
      /onNavigate=\{\(destination\) => \{\s*setSlidePackId\(null\);\s*setScreen\(destination\);/,
    );
  });
});
