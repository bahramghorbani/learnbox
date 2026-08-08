// @vitest-environment jsdom

import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StartMediaVisual } from '../app/components/StartMediaVisual';

describe('Start card media visual', () => {
  let rendered: RenderedMedia | undefined;

  afterEach(async () => {
    await rendered?.unmount();
    rendered = undefined;
    vi.unstubAllGlobals();
  });

  it('renders only the same-origin private image in private-session mode', async () => {
    rendered = await renderMedia('private-session');

    expect(rendered.image()?.getAttribute('src')).toBe('/api/private-media/start-a1-001/image');
    expect(rendered.text()).toContain('رسانهٔ محافظت‌شدهٔ آلفا');
  });

  it('keeps localhost media explicitly labelled as a local QA preview', async () => {
    rendered = await renderMedia('local-preview');

    expect(rendered.image()?.getAttribute('src')).toBe(
      '/api/local-preview-media/start-a1-001/image',
    );
    expect(rendered.text()).toContain('فقط برای بررسی محلی');
  });

  it('renders no media route in placeholder mode', async () => {
    rendered = await renderMedia('placeholder');

    expect(rendered.image()).toBeNull();
    expect(rendered.text()).toContain('در حال آماده‌سازی است');
  });

  it('returns to the neutral placeholder after an image route fails', async () => {
    rendered = await renderMedia('private-session');

    await rendered.failImage();

    expect(rendered.image()).toBeNull();
    expect(rendered.text()).toContain('رسانهٔ این کارت اکنون در دسترس نیست');
  });
});

describe('learner page media attachment boundary', () => {
  it('derives media from the auth mode and exact public flag instead of staged URLs', () => {
    const pageSource = readWebsiteFile('../app/page.tsx');
    const sliceSource = readWebsiteFile('../app/start-slice.ts');

    expect(pageSource).toContain('resolveStartMediaMode({');
    expect(pageSource).toContain('NEXT_PUBLIC_LEARNBOX_PRIVATE_MEDIA_ENABLED');
    expect(pageSource).toContain('authMode');
    expect(pageSource).toContain('buildStartMediaSources(currentItem.id, startMediaMode)');
    expect(pageSource).toContain(
      '<StartMediaVisual contentId={currentItem.id} mode={startMediaMode} />',
    );
    expect(sliceSource).not.toContain('/api/private-media/');
    expect(sliceSource).not.toContain('/api/local-preview-media/');
  });
});

type RenderedMedia = {
  failImage(): Promise<void>;
  image(): HTMLImageElement | null;
  text(): string;
  unmount(): Promise<void>;
};

async function renderMedia(mode: 'placeholder' | 'local-preview' | 'private-session') {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  await act(async () => {
    root.render(createElement(StartMediaVisual, { contentId: 'start-a1-001', mode }));
  });

  return {
    failImage: async () => {
      const image = container.querySelector('img');
      if (!image) throw new Error('Expected rendered image.');
      await act(async () => image.dispatchEvent(new Event('error')));
    },
    image: () => container.querySelector('img'),
    text: () => container.textContent ?? '',
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  } satisfies RenderedMedia;
}

function readWebsiteFile(relativePath: string) {
  return readFileSync(resolve(process.cwd(), 'test', relativePath), 'utf8');
}
