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

  it('rejects a receipt with a non-HTTPS url', () => {
    const result = validateMediaReceipt(plan, [
      { ...received[0], url: 'http://insecure.example.test/haus.webp' },
      received[1],
      received[2],
    ]);
    expect(result.readyForAttachment).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining(['نشانی رسانهٔ start-a1-haus-image-v1 باید HTTPS باشد.']),
    );
  });

  it('rejects a receipt whose mime type does not match the asset kind', () => {
    const result = validateMediaReceipt(plan, [
      // An image claimed as a word_audio asset's mime is invalid.
      { ...received[0], mimeType: 'audio/mpeg' },
      received[1],
      received[2],
    ]);
    expect(result.readyForAttachment).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining(['فرمت رسانهٔ start-a1-haus-image-v1 برای نوع آن معتبر نیست.']),
    );
  });

  it('rejects a sha256 that is not 64 lowercase hex characters', () => {
    const result = validateMediaReceipt(plan, [
      { ...received[0], sha256: 'g'.repeat(64) },
      received[1],
      received[2],
    ]);
    expect(result.readyForAttachment).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining(['هش SHA-256 رسانهٔ start-a1-haus-image-v1 معتبر نیست.']),
    );
  });

  it('rejects a rejected QA asset even when the hash is valid', () => {
    const result = validateMediaReceipt(plan, [
      { ...received[0], qaStatus: 'rejected' as const },
      received[1],
      received[2],
    ]);
    expect(result.readyForAttachment).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining(['QA رسانهٔ start-a1-haus-image-v1 هنوز تأیید نشده است.']),
    );
  });

  it('flags a duplicate delivery of the same asset', () => {
    const result = validateMediaReceipt(plan, [
      received[0],
      { ...received[0], url: 'https://media.example.test/duplicate.webp' },
      received[1],
      received[2],
    ]);
    expect(result.readyForAttachment).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining(['رسانهٔ start-a1-haus-image-v1 بیش از یک‌بار تحویل شده است.']),
    );
  });

  it('flags an asset that exists in the manifest but not in the production plan', () => {
    const result = validateMediaReceipt(plan, [
      ...received,
      {
        ...received[0],
        assetId: 'start-a1-unknown-image-v1',
        contentId: 'start-a1-unknown',
      },
    ]);
    expect(result.readyForAttachment).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining(['رسانهٔ start-a1-unknown-image-v1 در برنامهٔ تولید وجود ندارد.']),
    );
  });

  it('blocks the full set when a single asset has every violation', () => {
    const result = validateMediaReceipt(plan, [
      {
        ...received[0],
        contentId: 'wrong-content',
        kind: 'sentence_audio' as const,
        storageKey: 'wrong/storage',
        url: 'ftp://bad',
        mimeType: 'application/pdf',
        sha256: 'invalid',
        qaStatus: 'pending' as const,
      },
      received[1],
      received[2],
    ]);
    expect(result.readyForAttachment).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        'شناسه یا مسیر نسخهٔ رسانهٔ start-a1-haus-image-v1 با برنامه مطابقت ندارد.',
        'نشانی رسانهٔ start-a1-haus-image-v1 باید HTTPS باشد.',
        'فرمت رسانهٔ start-a1-haus-image-v1 برای نوع آن معتبر نیست.',
        'هش SHA-256 رسانهٔ start-a1-haus-image-v1 معتبر نیست.',
        'QA رسانهٔ start-a1-haus-image-v1 هنوز تأیید نشده است.',
      ]),
    );
  });
});
