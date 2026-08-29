import { describe, expect, it } from 'vitest';

import { syncStateText } from '../app/learner-sync-state';

describe('learner sync state labels', () => {
  it('labels the Today surface as device-local and not yet server-connected', () => {
    const text = syncStateText('local-only');
    expect(text).toContain('دستگاه');
    expect(text).toContain('سرور');
    expect(text).toContain('این فهرست');
  });

  it('claims server-backed state only with an explicit server read', () => {
    expect(syncStateText('server-backed')).toContain('سرور');
  });
});
