import { describe, expect, it } from 'vitest';

import { validateMediaReceipt } from '../src/index.js';

const plan = [
  {
    assetId: 'start-a1-haus-image-v1',
    contentId: 'start-a1-haus',
    kind: 'image' as const,
    storageKey: 'start-a1-haus/image/v1',
  },
  {
    assetId: 'start-a1-haus-word-audio-v1',
    contentId: 'start-a1-haus',
    kind: 'word_audio' as const,
    storageKey: 'start-a1-haus/word_audio/v1',
  },
  {
    assetId: 'start-a1-haus-sentence-audio-v1',
    contentId: 'start-a1-haus',
    kind: 'sentence_audio' as const,
    storageKey: 'start-a1-haus/sentence_audio/v1',
  },
];

const received = [
  {
    ...plan[0],
    url: 'https://media.example.test/haus.webp',
    mimeType: 'image/webp',
    sha256: 'a'.repeat(64),
    qaStatus: 'approved' as const,
  },
  {
    ...plan[1],
    url: 'https://media.example.test/haus-word.mp3',
    mimeType: 'audio/mpeg',
    sha256: 'b'.repeat(64),
    qaStatus: 'approved' as const,
  },
  {
    ...plan[2],
    url: 'https://media.example.test/haus-sentence.mp3',
    mimeType: 'audio/mpeg',
    sha256: 'c'.repeat(64),
    qaStatus: 'approved' as const,
  },
];

describe('media receipt validation', () => {
  it('makes a fully checked media manifest eligible only for later attachment', () => {
    expect(validateMediaReceipt(plan, received)).toEqual({ readyForAttachment: true, issues: [] });
  });

  it('blocks changed paths, unapproved QA and malformed receipts', () => {
    const result = validateMediaReceipt(plan, [
      { ...received[0], storageKey: 'wrong/path', sha256: 'not-a-hash' },
      { ...received[1], qaStatus: 'pending' as const },
    ]);
    expect(result.readyForAttachment).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        'تعداد رسانه‌های دریافت‌شده با برنامهٔ تأییدشده برابر نیست.',
        'شناسه یا مسیر نسخهٔ رسانهٔ start-a1-haus-image-v1 با برنامه مطابقت ندارد.',
        'هش SHA-256 رسانهٔ start-a1-haus-image-v1 معتبر نیست.',
        'QA رسانهٔ start-a1-haus-word-audio-v1 هنوز تأیید نشده است.',
        'رسانهٔ برنامه‌ریزی‌شدهٔ start-a1-haus-sentence-audio-v1 دریافت نشده است.',
      ]),
    );
  });
});
