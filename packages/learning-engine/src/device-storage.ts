export interface DeviceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Keeps the learner flow usable when persistent browser storage is unavailable. */
export function createMemoryStorage(): DeviceStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

/** Prefers durable storage but never lets a browser storage exception break learning. */
export function createResilientStorage(
  primary: DeviceStorage,
  fallback: DeviceStorage = createMemoryStorage(),
): DeviceStorage {
  return {
    getItem(key) {
      try {
        return primary.getItem(key) ?? fallback.getItem(key);
      } catch {
        return fallback.getItem(key);
      }
    },
    setItem(key, value) {
      try {
        primary.setItem(key, value);
        fallback.removeItem(key);
      } catch {
        fallback.setItem(key, value);
      }
    },
    removeItem(key) {
      try {
        primary.removeItem(key);
      } catch {
        // The fallback removal below still keeps the current session consistent.
      } finally {
        fallback.removeItem(key);
      }
    },
  };
}
