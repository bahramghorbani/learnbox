import { describe, expect, it } from 'vitest';

import {
  evaluateLaunchPublicationReadiness,
  validateLaunchExperience,
  type LaunchExperienceRecord,
} from '../src/index.js';

const approvedSplash: LaunchExperienceRecord = {
  id: 'germany-welcome-v1',
  kind: 'launch_screen',
  status: 'approved',
  asset: {
    path: '/images/launch/germany-welcome-v1.png',
    checksumSha256: 'a'.repeat(64),
    width: 864,
    height: 1821,
    focalPoint: { x: 50, y: 58 },
  },
  fallbackId: 'default-welcome-v1',
};

describe('launch experience validation', () => {
  it('accepts an approved mobile splash selected by a publisher', () => {
    expect(validateLaunchExperience(approvedSplash)).toEqual([]);
    expect(evaluateLaunchPublicationReadiness(approvedSplash, 'content_publisher')).toEqual({
      canPublish: true,
      blockers: [],
    });
  });

  it('requires a square, high-resolution icon in the icon asset area', () => {
    expect(
      validateLaunchExperience({
        ...approvedSplash,
        id: 'learnbox-icon-v1',
        kind: 'install_icon',
        asset: {
          ...approvedSplash.asset,
          path: '/icons/learnbox-v1-1024.png',
          width: 1024,
          height: 1024,
        },
      }),
    ).toEqual([]);
    expect(
      validateLaunchExperience({
        ...approvedSplash,
        kind: 'install_icon',
        asset: {
          ...approvedSplash.asset,
          path: '/images/launch/not-square.png',
          width: 600,
          height: 500,
        },
      }).map((issue) => issue.field),
    ).toEqual(expect.arrayContaining(['asset.path', 'asset.dimensions']));
  });

  it('rejects unsafe schedule data and keeps reviewers from publishing', () => {
    const invalid = {
      ...approvedSplash,
      status: 'scheduled' as const,
      startsAt: '2026-12-25T00:00:00Z',
      endsAt: '2026-12-24T00:00:00Z',
      fallbackId: 'germany-welcome-v1',
    };
    expect(validateLaunchExperience(invalid).map((issue) => issue.field)).toEqual(
      expect.arrayContaining(['fallbackId', 'endsAt']),
    );
    expect(
      evaluateLaunchPublicationReadiness(approvedSplash, 'content_reviewer').blockers,
    ).toContain('فقط ناشر مجاز می‌تواند تجربهٔ آغاز را منتشر یا زمان‌بندی کند.');
  });
});
