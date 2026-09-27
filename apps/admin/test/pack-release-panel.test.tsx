// @vitest-environment jsdom

import { act, createElement, Fragment, type FunctionComponent } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContentPackManifest, LearningVocabularyItem } from '@learnbox/content-models';

const readyManifest: ContentPackManifest = {
  id: 'release-fixture',
  version: 1,
  tierId: 'learnbox_start',
  displayName: 'Release fixture',
  locale: 'de-DE',
  targetCefr: 'A1',
  targetItemCount: 1,
  releaseStatus: 'staging',
};

const readyItem: LearningVocabularyItem = {
  id: 'release-fixture-001',
  version: 1,
  status: 'approved',
  lemma: 'Haus',
  normalizedLemma: 'haus',
  article: 'das',
  partOfSpeech: 'noun',
  cefr: 'A1',
  persianMeanings: ['خانه'],
  examples: [{ german: 'Das Haus ist groß.', persian: 'خانه بزرگ است.' }],
  media: [
    {
      assetId: 'release-image-001',
      version: 1,
      kind: 'image',
      url: 'https://media.example.test/haus.webp',
      qualityStatus: 'approved',
    },
    {
      assetId: 'release-word-audio-001',
      version: 1,
      kind: 'word_audio',
      url: 'https://media.example.test/haus-word.mp3',
      qualityStatus: 'approved',
    },
    {
      assetId: 'release-sentence-audio-001',
      version: 1,
      kind: 'sentence_audio',
      url: 'https://media.example.test/haus-sentence.mp3',
      qualityStatus: 'approved',
    },
  ],
  source: { provider: 'editorial', reference: 'release fixture' },
  simpleGermanDefinition: 'Ein Gebäude, in dem Menschen wohnen.',
  grammarNote: 'Neutrum; Plural mit Umlaut.',
  topicTags: ['household'],
  difficulty: 1,
  visualConcept: 'A clear house.',
  imagePrompt: 'A clear house, no text.',
  provenance: { sourceType: 'editorial', sourceReference: 'release fixture' },
  mediaQa: {
    visual: {
      semanticRole: 'concrete_noun',
      boboRole: 'absent',
      semanticAccurate: true,
      primaryConceptClear: true,
      mobileReadable: true,
      hasGeneratedText: false,
      hasWatermark: false,
      hasUnnecessaryClutter: false,
    },
    audio: {
      wordAudioVerified: true,
      sentenceAudioVerified: true,
      noTruncationOrDistortion: true,
    },
  },
};

describe('PackReleasePanel', () => {
  let rendered: Rendered | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-10T12:00:00.000Z'));
  });

  afterEach(async () => {
    await rendered?.unmount();
    rendered = undefined;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('shows the pack summary and readiness for a ready pack', async () => {
    rendered = await renderPanel({
      manifest: readyManifest,
      items: [readyItem],
      actorRole: 'content_publisher',
    });

    expect(rendered.text()).toContain('وضعیت انتشار بسته');
    expect(rendered.text()).toContain('release-fixture');
    expect(rendered.text()).toContain('بسته برای انتشار آماده است.');
  });

  it('lists blockers when the pack is not ready', async () => {
    rendered = await renderPanel({
      manifest: { ...readyManifest, releaseStatus: 'draft' },
      items: [{ ...readyItem, status: 'needs_review' }],
      actorRole: 'content_reviewer',
    });

    expect(rendered.text()).toContain('انتشار بسته هنوز ممکن نیست');
    expect(rendered.text()).toContain('بسته باید پیش از انتشار در وضعیت آماده‌سازی باشد.');
    expect(rendered.text()).toContain('فقط ناشر محتوا می‌تواند انتشار بسته را درخواست کند.');
  });

  it('keeps the release action disabled and non-public', async () => {
    rendered = await renderPanel({
      manifest: readyManifest,
      items: [readyItem],
      actorRole: 'content_publisher',
    });

    const button = rendered.container.querySelector<HTMLButtonElement>('.release-button');
    expect(button).not.toBeNull();
    expect(button?.disabled).toBe(true);
    expect(rendered.text()).toContain('درخواست انتشار (غیرفعال)');
    expect(rendered.text()).toContain('انتشار واقعی پس از اتصال پنل مدیریت تأییدشده فعال می‌شود.');
  });
});

type Rendered = {
  container: HTMLElement;
  text(): string;
  unmount(): Promise<void>;
};

async function renderPanel(props: {
  actorRole: 'content_reviewer' | 'content_publisher' | 'super_admin';
  items: LearningVocabularyItem[];
  manifest: ContentPackManifest;
}): Promise<Rendered> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal('React', { createElement, Fragment });
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  const { PackReleasePanel } = await import('../app/components/PackReleasePanel.js');
  await act(async () => {
    root.render(createElement(PackReleasePanel as FunctionComponent<typeof props>, props));
  });

  return {
    container,
    text: () => container.textContent ?? '',
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}
