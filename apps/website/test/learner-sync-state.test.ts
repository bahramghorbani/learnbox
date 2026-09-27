import { describe, expect, it } from 'vitest';

import { syncStateText } from '../app/learner-sync-state';

describe('learner sync state labels', () => {
  it('requires server authentication rather than claiming a device-local release fallback', () => {
    const text = syncStateText('local-only');
    expect(text).toContain('ورود');
    expect(text).toContain('سرور');
    expect(text).not.toContain('این فهرست');
  });

  it('claims server-backed state only with an explicit server read', () => {
    expect(syncStateText('server-backed')).toContain('سرور');
  });
});
