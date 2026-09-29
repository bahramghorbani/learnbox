import { createMemoryStorage } from '@learnbox/learning-engine';
import { describe, expect, it } from 'vitest';

import {
  UNRESOLVED_ACCOUNT_SCOPE,
  accountStorageScope,
  refuseUnresolvedScope,
} from '../lib/account-storage-scope';

describe('account storage scope (no silent shared bucket)', () => {
  it('is empty for the local prototype and per-user for a resolved account', () => {
    expect(accountStorageScope(false, null)).toBe('');
    expect(accountStorageScope(false, 'u1')).toBe('');
    expect(accountStorageScope(true, 'u1')).toBe(':account:u1');
  });

  it('never resolves to the legacy shared "unverified" bucket', () => {
    const scope = accountStorageScope(true, null);
    expect(scope).toBe(UNRESOLVED_ACCOUNT_SCOPE);
    expect(scope).not.toContain('unverified');
  });

  it('drops writes and hides reads for unresolved-scope keys', () => {
    const backing = createMemoryStorage();
    const storage = refuseUnresolvedScope(backing);
    const key = `learnbox:daily-review:v1${UNRESOLVED_ACCOUNT_SCOPE}`;
    storage.setItem(key, '{"reviewedCount":99}');
    expect(backing.getItem(key)).toBeNull();
    expect(storage.getItem(key)).toBeNull();
  });

  it('cannot read an unresolved-scope value even if one was planted underneath', () => {
    const backing = createMemoryStorage();
    const key = `learnbox:learning-streak:v1${UNRESOLVED_ACCOUNT_SCOPE}`;
    backing.setItem(key, '{"days":99}');
    expect(refuseUnresolvedScope(backing).getItem(key)).toBeNull();
  });

  it('passes resolved-account and local-prototype keys through untouched', () => {
    const backing = createMemoryStorage();
    const storage = refuseUnresolvedScope(backing);
    storage.setItem('learnbox:x:account:u1', 'a');
    storage.setItem('learnbox:x:local-prototype', 'b');
    expect(storage.getItem('learnbox:x:account:u1')).toBe('a');
    expect(backing.getItem('learnbox:x:local-prototype')).toBe('b');
    storage.removeItem('learnbox:x:account:u1');
    expect(backing.getItem('learnbox:x:account:u1')).toBeNull();
  });
});
