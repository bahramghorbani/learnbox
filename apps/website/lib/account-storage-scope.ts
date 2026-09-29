import type { DeviceStorage } from '@learnbox/learning-engine';

/**
 * Device-storage scoping for server accounts (LB-B11 / CP-3).
 *
 * Before the session's user id is known there is no account to scope to. The old code
 * fell back to the literal `:account:unverified`, so anything written in that window
 * landed in a shared bucket that the next login could read. The scope is now an
 * explicit UNRESOLVED sentinel, and storage refuses to read or write any key that
 * carries it. This holds even if a future effect forgets its own guard.
 */
export const UNRESOLVED_ACCOUNT_SCOPE = ':account:unresolved';

export function accountStorageScope(isServerOtp: boolean, sessionUserId: string | null): string {
  if (!isServerOtp) return '';
  return sessionUserId ? `:account:${sessionUserId}` : UNRESOLVED_ACCOUNT_SCOPE;
}

export function isUnresolvedScopeKey(key: string): boolean {
  return key.endsWith(UNRESOLVED_ACCOUNT_SCOPE);
}

/** Reads return null and writes are dropped for keys in the unresolved scope. */
export function refuseUnresolvedScope(storage: DeviceStorage): DeviceStorage {
  return {
    getItem: (key) => (isUnresolvedScopeKey(key) ? null : storage.getItem(key)),
    setItem: (key, value) => {
      if (!isUnresolvedScopeKey(key)) storage.setItem(key, value);
    },
    removeItem: (key) => {
      if (!isUnresolvedScopeKey(key)) storage.removeItem(key);
    },
  };
}
